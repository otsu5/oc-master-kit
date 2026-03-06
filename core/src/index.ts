import express from 'express'
import { v4 as uuid } from 'uuid'
import { db, initDB, auditLog, logCost, type AgentType, type Job } from './db.js'
import { writeResult, stagingSummary } from './runner.service.js'
import { getAdapter } from './adapters.js'
import { authMiddleware, checkAuthConfig, isAdminUser } from './auth.js'
import { checkBudget, getBudgetSummary } from './budget.js'
import { CreateJobSchema, RunJobSchema, CancelJobSchema } from './validate.js'
import { sanitizePrompt } from './sanitize.js'
import { startMemoryMonitor, isMemoryPressure, getMemoryStatus } from './memory.js'

;(async () => {
  await initDB()
  checkAuthConfig()
  startMemoryMonitor()
})()

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// 認証ミドルウェア（/health 以外に適用）
app.use(authMiddleware)

// ── ヘルスチェック（認証不要）─────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ── ジョブ登録 ────────────────────────────────────────────
app.post('/jobs', (req, res) => {
  const parsed = CreateJobSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    })
  }

  const { text, agentType, userId } = parsed.data

  // プロンプトサニタイズ（危険パターンブロック）
  const sanitized = sanitizePrompt(text)
  if (!sanitized.safe) {
    return res.status(400).json({
      error: 'Prompt blocked by safety filter',
      reason: sanitized.blocked,
    })
  }

  const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const short = uuid().slice(0, 8)
  const id    = `${date}-${short}`

  db.prepare(`
    INSERT INTO jobs (id, text, agent_type, status, created_by, created_at)
    VALUES (?, ?, ?, 'PENDING', ?, ?)
  `).run(id, sanitized.sanitized, agentType as AgentType, userId, Date.now())

  auditLog(id, 'CREATED', userId, sanitized.sanitized.slice(0, 200))
  console.log(`[JOB] Created: ${id} agent=${agentType} by=${userId}`)

  res.status(201).json({ id, status: 'PENDING', agentType })
})

// ── ジョブ一覧 ────────────────────────────────────────────
app.get('/jobs', (req, res) => {
  const { status } = req.query
  const jobs = status
    ? db.prepare(`SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT 20`).all(status)
    : db.prepare(`SELECT * FROM jobs WHERE status IN ('PENDING','RUNNING') ORDER BY created_at DESC LIMIT 20`).all()
  res.json(jobs)
})

// ── ジョブ詳細 ────────────────────────────────────────────
app.get('/jobs/:id', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

// ── ジョブ実行（承認＋実行）──────────────────────────────
app.post('/jobs/:id/run', async (req, res) => {
  const parsed = RunJobSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request' })

  const { approvedBy } = parsed.data
  
  // Core側admin判定（Interface層のisAdminを信用しない）
  if (!isAdminUser(approvedBy)) {
    return res.status(403).json({ error: 'Admin permission required (Core-enforced)', userId: approvedBy })
  }

  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id) as Job | undefined

  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (job.status !== 'PENDING') {
    return res.status(400).json({ error: `Cannot run: status=${job.status}` })
  }

  // メモリ圧迫チェック
  if (isMemoryPressure()) {
    const mem = getMemoryStatus()
    return res.status(503).json({
      error: 'System under memory pressure — job execution blocked',
      freeGB: mem.freeGB,
      usedPct: mem.usedPct,
    })
  }

  // 予算チェック（Ollama以外）
  const budgetCheck = checkBudget(job.agent_type)
  if (!budgetCheck.allowed) {
    auditLog(job.id, 'BUDGET_BLOCKED', approvedBy, budgetCheck.reason)
    return res.status(429).json({
      error: 'Budget limit reached',
      reason: budgetCheck.reason,
      budget: { daily: budgetCheck.dailyCost, monthly: budgetCheck.monthlyCost }
    })
  }

  db.prepare(`UPDATE jobs SET status='RUNNING', approved_by=?, approved_at=? WHERE id=?`)
    .run(approvedBy, Date.now(), job.id)
  auditLog(job.id, 'APPROVED_AND_RUNNING', approvedBy)

  res.json({
    ok: true, jobId: job.id, status: 'RUNNING',
    agentType: job.agent_type,
    budgetWarning: budgetCheck.warning ?? null
  })

  // バックグラウンド実行
  ;(async () => {
    try {
      const adapter = getAdapter(job.agent_type)
      console.log(`[JOB] Running ${job.id} via ${adapter.name}`)
      const result = await adapter.generate(job.text)

      // コスト記録
      logCost(job.id, adapter.provider, adapter.model, result.costUsd, result.tokensIn, result.tokensOut)

      const filePath = writeResult(job.id, result.text)

      db.prepare(`UPDATE jobs SET status='DONE', result_path=? WHERE id=?`).run(filePath, job.id)
      auditLog(job.id, 'DONE', 'system', `path=${filePath} cost=$${result.costUsd.toFixed(4)}`)
      console.log(`[JOB] Done: ${job.id} → ${filePath} ($${result.costUsd.toFixed(4)})`)
    } catch (err: any) {
      const retryCount = (job.retry_count ?? 0) + 1
      db.prepare(`UPDATE jobs SET status='ERROR', error=?, retry_count=? WHERE id=?`)
        .run(err.message, retryCount, job.id)
      auditLog(job.id, 'ERROR', 'system', err.message)
      console.error(`[JOB] Error: ${job.id} (attempt ${retryCount})`, err.message)
    }
  })()
})

// ── ジョブキャンセル ─────────────────────────────────────
app.post('/jobs/:id/cancel', (req, res) => {
  const parsed = CancelJobSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request' })

  const { cancelledBy } = parsed.data

  // Core側admin判定
  if (!isAdminUser(cancelledBy)) {
    return res.status(403).json({ error: 'Admin permission required (Core-enforced)', userId: cancelledBy })
  }

  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id) as Job | undefined

  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (!['PENDING', 'APPROVED'].includes(job.status)) {
    return res.status(400).json({ error: `Cannot cancel: status=${job.status}` })
  }

  db.prepare(`UPDATE jobs SET status='CANCELLED' WHERE id=?`).run(job.id)
  auditLog(job.id, 'CANCELLED', cancelledBy)
  res.json({ ok: true, jobId: job.id })
})

// ── システム状態 ──────────────────────────────────────────
app.get('/status', (_req, res) => {
  const summary = db.prepare(
    `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
  ).all() as { status: string; count: number }[]

  const staging = stagingSummary()
  const budget = getBudgetSummary()
  const memory = getMemoryStatus()

  res.json({
    jobs: Object.fromEntries(summary.map(r => [r.status, r.count])),
    staging,
    budget,
    memory,
    ts: Date.now()
  })
})

const PORT = Number(process.env.CORE_PORT ?? 8787)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[OC-Core] :${PORT} | DB: ${process.env.DB_PATH}`)
  console.log(`[OC-Core] Ollama: ${process.env.OLLAMA_BASE_URL} | Model: ${process.env.OLLAMA_MODEL_LIGHT}`)
})
