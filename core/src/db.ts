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
// Ollama追加・runpod追加（PDF設計に準拠）
export type AgentType  = 'ollama' | 'claude' | 'opus' | 'openai' | 'miyabi' | 'runpod' | 'mock'

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
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     TEXT NOT NULL,
      action     TEXT NOT NULL,
      actor      TEXT NOT NULL,
      timestamp  INTEGER NOT NULL,
      detail     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_audit_job   ON audit_log(job_id);
  `)
}

export function auditLog(jobId: string, action: string, actor: string, detail?: string) {
  db.prepare(`
    INSERT INTO audit_log (job_id, action, actor, timestamp, detail)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobId, action, actor, Date.now(), detail ?? null)
}
