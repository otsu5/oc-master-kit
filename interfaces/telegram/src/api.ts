import axios from 'axios'

const CORE = process.env.CORE_URL ?? 'http://core:8787'
const http  = axios.create({ baseURL: CORE, timeout: 30_000 })

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
  ts: number
}

export const api = {
  async health()                                   { return (await http.get('/health')).data },
  async addJob(text: string, userId: string, agentType = 'ollama') {
    return (await http.post('/jobs', { text, agentType, userId })).data as { id: string; status: string }
  },
  async listJobs(status?: string) {
    return (await http.get('/jobs', { params: status ? { status } : {} })).data as Job[]
  },
  async getJob(id: string)                         { return (await http.get(`/jobs/${id}`)).data as Job },
  async runJob(id: string, approvedBy: string)     { return (await http.post(`/jobs/${id}/run`, { approvedBy })).data },
  async cancelJob(id: string, cancelledBy: string) { return (await http.post(`/jobs/${id}/cancel`, { cancelledBy })).data },
  async status()                                   { return (await http.get('/status')).data as StatusSummary },
}
