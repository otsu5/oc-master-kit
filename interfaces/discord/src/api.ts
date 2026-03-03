import axios from 'axios'

const CORE = process.env.CORE_URL ?? 'http://core:8787'
const TOKEN = process.env.CORE_API_TOKEN ?? ''

const http = axios.create({
  baseURL: CORE,
  timeout: 30_000,
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
})

export interface Job {
  id: string
  text: string
  agent_type: string
  status: string
  created_by: string
  created_at: number
  approved_by: string | null
  result_path: string | null
  error: string | null
}

export interface StatusSummary {
  jobs: Record<string, number>
  staging: { count: number; files: string[] }
  budget: { daily: { used: number; limit: number }; monthly: { used: number; limit: number } }
  memory: { totalGB: number; freeGB: number; usedPct: number }
  ts: number
}

export const api = {
  async listJobs(status?: string) {
    return (await http.get('/jobs', { params: status ? { status } : {} })).data as Job[]
  },

  async getJob(id: string) {
    return (await http.get(`/jobs/${id}`)).data as Job
  },

  async status() {
    return (await http.get('/status')).data as StatusSummary
  },
}
