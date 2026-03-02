import { z } from 'zod'
import { VALID_AGENT_TYPES, type AgentType } from './db.js'

export const CreateJobSchema = z.object({
  text: z.string().min(1, 'text is required').max(5000, 'text too long (max 5000 chars)'),
  agentType: z.enum(VALID_AGENT_TYPES as [AgentType, ...AgentType[]]).default('ollama'),
  userId: z.string().min(1).default('unknown'),
})

export const RunJobSchema = z.object({
  approvedBy: z.string().min(1).default('unknown'),
})

export const CancelJobSchema = z.object({
  cancelledBy: z.string().min(1).default('unknown'),
})

export type CreateJobInput = z.infer<typeof CreateJobSchema>
export type RunJobInput = z.infer<typeof RunJobSchema>
export type CancelJobInput = z.infer<typeof CancelJobSchema>
