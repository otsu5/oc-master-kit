import express from 'express'
import { v4 as uuid } from 'uuid'
import { db, initDB, auditLog, type AgentType } from './db.js'
import { writeResult, stagingSummary } from './runner.service.js'
import { getAdapter } from './adapters.js'

initDB()
const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ── ヘルスチェック ────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ── ジョブ登録（デフォルトagentType: ollama）─────────────
app.post('/jobs', (req, res) => {
  // デフォルトをollamaに変更（PDF設計に準拠）
  const { text, agentType = 'ollama', userId = 'unknown' } = req.body

  if (!text?.trim()) return res.status(400).json({ error: 'text is required' })

  const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const short = uuid().slice(0, 8)
  const id    = `${date}-${short}`

  db.prepare(`
    INSERT INTO jobs (id, text, agent_type, status, created_by, created_at)
    VALUES (?, ?, ?, 'PENDING', ?, ?)
  `).run(id, text.trim(), agentType as AgentType, String(userId), Date.now())

  auditLog(id, 'CREATED', String(userId), text.trim())
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
  const { approvedBy = 'unknown' } = req.body
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id) as any

  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (job.status !== 'PENDING') {
    return res.status(400).json({ error: `Cannot run: status=${job.status}` })
  }

  db.prepare(`UPDATE jobs SET status='RUNNING', approved_by=?, approved_at=? WHERE id=?`)
    .run(approvedBy, Date.now(), job.id)
  auditLog(job.id, 'APPROVED_AND_RUNNING', String(approvedBy))

  res.json({ ok: true, jobId: job.id, status: 'RUNNING', agentType: job.agent_type })

  // バックグラウンド実行
  ;(async () => {
    try {
      const adapter = getAdapter(job.agent_type)
      console.log(`[JOB] Running ${job.id} via ${adapter.name}`)
      const result   = await adapter.generate(job.text)
      const filePath = writeResult(job.id, result)

      db.prepare(`UPDATE jobs SET status='DONE', result_path=? WHERE id=?`).run(filePath, job.id)
      auditLog(job.id, 'DONE', 'system', filePath)
      console.log(`[JOB] Done: ${job.id} → ${filePath}`)
    } catch (err: any) {
      db.prepare(`UPDATE jobs SET status='ERROR', error=? WHERE id=?`).run(err.message, job.id)
      auditLog(job.id, 'ERROR', 'system', err.message)
      console.error(`[JOB] Error: ${job.id}`, err.message)
    }
  })()
})

// ── ジョブキャンセル ─────────────────────────────────────
app.post('/jobs/:id/cancel', (req, res) => {
  const { cancelledBy = 'unknown' } = req.body
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id) as any

  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (!['PENDING', 'APPROVED'].includes(job.status)) {
    return res.status(400).json({ error: `Cannot cancel: status=${job.status}` })
  }

  db.prepare(`UPDATE jobs SET status='CANCELLED' WHERE id=?`).run(job.id)
  auditLog(job.id, 'CANCELLED', String(cancelledBy))
  res.json({ ok: true, jobId: job.id })
})

// ── システム状態（Telegram監視用）────────────────────────
app.get('/status', (_req, res) => {
  const summary = db.prepare(
    `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
  ).all() as { status: string; count: number }[]

  const staging = stagingSummary()

  res.json({
    jobs: Object.fromEntries(summary.map(r => [r.status, r.count])),
    staging,
    ts: Date.now()
  })
})

const PORT = Number(process.env.CORE_PORT ?? 8787)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[OC-Core] :${PORT} | DB: ${process.env.DB_PATH}`)
  console.log(`[OC-Core] Ollama: ${process.env.OLLAMA_BASE_URL} | Model: ${process.env.OLLAMA_MODEL_LIGHT}`)
})
