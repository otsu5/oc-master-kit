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
  retry_count: number
}

export interface StatusSummary {
  jobs: Record<string, number>
  staging: { count: number; files: string[] }
  budget: {
    daily: { used: number; limit: number }
    monthly: { used: number; limit: number }
  }
  ts: number
}

export const api = {
  async health() {
    return (await http.get('/health')).data
  },

  async addJob(text: string, userId: string, agentType = 'ollama') {
    return (await http.post('/jobs', { text, agentType, userId })).data as {
      id: string; status: string; agentType: string
    }
  },

  async listJobs(status?: string) {
    return (await http.get('/jobs', { params: status ? { status } : {} })).data as Job[]
  },

  async getJob(id: string) {
    return (await http.get(`/jobs/${id}`)).data as Job
  },

  async runJob(id: string, approvedBy: string) {
    return (await http.post(`/jobs/${id}/run`, { approvedBy })).data as {
      ok: boolean; jobId: string; status: string; budgetWarning?: string | null
    }
  },

  async cancelJob(id: string, cancelledBy: string) {
    return (await http.post(`/jobs/${id}/cancel`, { cancelledBy })).data
  },

  async status() {
    return (await http.get('/status')).data as StatusSummary
  },
}
