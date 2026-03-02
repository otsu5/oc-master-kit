import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const dbPath = process.env.DB_PATH ?? '/oc/agent/queue/oc_core.sqlite'
const dbDir  = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export type JobStatus  = 'PENDING' | 'APPROVED' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'ERROR'
export type AgentType  = 'ollama' | 'claude' | 'opus' | 'openai' | 'miyabi' | 'runpod' | 'mock'

export const VALID_AGENT_TYPES: AgentType[] = [
  'ollama', 'claude', 'opus', 'openai', 'miyabi', 'runpod', 'mock'
]

export interface Job {
  id: string
  text: string
  agent_type: AgentType
  status: JobStatus
  created_by: string
  created_at: number
  approved_by: string | null
  approved_at: number | null
  result_path: string | null
  error: string | null
  retry_count: number
}

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          TEXT PRIMARY KEY,
      text        TEXT NOT NULL,
      agent_type  TEXT NOT NULL DEFAULT 'ollama',
      status      TEXT NOT NULL DEFAULT 'PENDING',
      created_by  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      approved_by TEXT,
      approved_at INTEGER,
      result_path TEXT,
      error       TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     TEXT NOT NULL,
      action     TEXT NOT NULL,
      actor      TEXT NOT NULL,
      timestamp  INTEGER NOT NULL,
      detail     TEXT
    );

    CREATE TABLE IF NOT EXISTS cost_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     TEXT NOT NULL,
      provider   TEXT NOT NULL,
      model      TEXT NOT NULL,
      cost_usd   REAL NOT NULL DEFAULT 0,
      tokens_in  INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      timestamp  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_audit_job   ON audit_log(job_id);
    CREATE INDEX IF NOT EXISTS idx_cost_job    ON cost_log(job_id);
    CREATE INDEX IF NOT EXISTS idx_cost_ts     ON cost_log(timestamp);
  `)

  // 起動時にRUNNINGのまま放置されたジョブをERRORに復旧
  const staleJobs = db.prepare(
    `UPDATE jobs SET status='ERROR', error='Process crashed during execution (recovered on startup)' WHERE status='RUNNING'`
  ).run()
  if (staleJobs.changes > 0) {
    console.log(`[DB] Recovered ${staleJobs.changes} stale RUNNING job(s) → ERROR`)
  }
}

export function auditLog(jobId: string, action: string, actor: string, detail?: string) {
  db.prepare(`
    INSERT INTO audit_log (job_id, action, actor, timestamp, detail)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobId, action, actor, Date.now(), detail ?? null)
}

export function logCost(jobId: string, provider: string, model: string, costUsd: number, tokensIn = 0, tokensOut = 0) {
  db.prepare(`
    INSERT INTO cost_log (job_id, provider, model, cost_usd, tokens_in, tokens_out, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(jobId, provider, model, costUsd, tokensIn, tokensOut, Date.now())
}
