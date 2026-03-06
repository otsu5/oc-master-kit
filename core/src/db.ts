import initSqlJs from 'sql.js'
import path from 'node:path'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

export type JobStatus = 'PENDING' | 'APPROVED' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'ERROR'
export type AgentType = 'ollama' | 'claude' | 'opus' | 'openai' | 'miyabi' | 'runpod' | 'mock' | 'glm-flash' | 'glm-5' | 'groq'
export const VALID_AGENT_TYPES: AgentType[] = [
  'ollama', 'claude', 'opus', 'openai', 'miyabi', 'runpod', 'mock', 'glm-flash', 'glm-5', 'groq'
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

export class Database {
  private db: any
  private dbPath: string
  private initialized: boolean = false

  constructor() {
    this.dbPath = process.env.DB_PATH ?? '/oc/agent/queue/oc_core.sqlite'
  }

  async init(): Promise<void> {
    if (this.initialized) return

    const dbDir = path.dirname(this.dbPath)
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

    const SQL = await initSqlJs()
    this.db = new SQL.Database()
    this.initialized = true

    this.initTables()
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id          TEXT PRIMARY KEY,
        text        TEXT NOT NULL,
        agent_type TEXT NOT NULL DEFAULT 'ollama',
        status      TEXT NOT NULL default 'PENDING',
        created_by TEXT NOT NULL,
        created_at  INTEGER NOT null,
        approved_by TEXT,
        approved_at INTEGER,
        result_path TEXT,
        error       TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0
      )
    `)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOincrement,
        job_id     TEXT NOT null,
        action     TEXT not null,
        actor      TEXT not null,
        timestamp INTEGER not null,
        detail     TEXT
      )
    `)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cost_log (
        id         INTEGER PRIMARY KEY autoincrement,
        job_id     TEXT not null,
        provider   TEXT not null,
        model      TEXT not null,
        cost_usd   REAL not null DEFAULT 0,
        tokens_in  INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        timestamp  INTEGER not null
      )
    `)
    this.db.exec(`create index if not exists idx_jobs_status on jobs(status)`)
    this.db.exec(`create index if not exists idx_audit_job on audit_log(job_id)`)
    this.db.exec(`create index if not exists idx_cost_job on cost_log(job_id)`)
    this.db.exec(`create index if not exists idx_cost_ts on cost_log(timestamp)`)
  }

  createJob(text: string, agentType: AgentType, createdBy: string): string {
    const id = uuidv4()
    const stmt = this.db.prepare(`
      INSERT INTO jobs (id, text, agent_type, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, text, agentType, 'PENDING', createdBy, Date.now())
    return id
  }

  getJob(id: string): Job | undefined {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`)
    return stmt.get(id) as Job | undefined
  }

  updateJobStatus(id: string, status: string, error?: string): void {
    const stmt = this.db.prepare(`UPDATE jobs SET status = ?, error = ? WHERE id = ?`)
    stmt.run(id, status, error ?? null)
  }

  updateJobResult(id: string, resultPath: string, approvedBy: string): void {
    const stmt = this.db.prepare(`UPDATE jobs SET result_path = ?, approved_by = ?, approved_at = ? WHERE id = ?`)
    stmt.run(id, resultPath, approvedBy, Date.now())
  }

  auditLog(jobId: string, action: string, actor: string, detail?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (job_id, action, actor, timestamp, detail)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(jobId, action, actor, Date.now(), detail)
  }

  logCost(jobId: string, provider: string, model: string, costUsd: number, tokensIn: number, tokensOut: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO cost_log (job_id, provider, model, cost_usd, tokens_in, tokens_out, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(jobId, provider, model, costUsd, tokensIn, tokensOut, Date.now())
  }

  getPendingJobs(): Job[] {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE status = 'PENDING' ORDER BY created_at ASC`)
    return stmt.all() as Job[]
  }

  getJobsByStatus(status: JobStatus): Job[] {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC`)
    return stmt.all() as Job[]
  }

  getApprovedJobs(): Job[] {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE status = 'APPROVED' ORDER BY created_at ASC`)
    return stmt.all() as Job[]
  }

  getRunningJobs(): Job[] {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE status = 'RUNNING'`)
    return stmt.all() as Job[]
  }

  close(): void {
    this.db.close()
  }
}

// グローバルインスタンス
let globalDb: Database | null = null

export async function initDB(): Promise<void> {
  if (!globalDb) {
    globalDb = new Database()
    await globalDb.init()
  }
}

export const db = {
  prepare: (sql: string) => {
    if (!globalDb) throw new Error('Database not initialized. Call initDB() first.')
    return globalDb['db'].prepare(sql)
  }
}

export function auditLog(jobId: string, action: string, actor: string, detail?: string): void {
  if (!globalDb) throw new Error('Database not initialized. Call initDB() first.')
  globalDb.auditLog(jobId, action, actor, detail)
}

export function logCost(jobId: string, provider: string, model: string, costUsd: number, tokensIn: number, tokensOut: number): void {
  if (!globalDb) throw new Error('Database not initialized. Call initDB() first.')
  globalDb.logCost(jobId, provider, model, costUsd, tokensIn, tokensOut)
}
