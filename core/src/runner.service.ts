import fs from 'node:fs'
import path from 'node:path'

const STAGING = path.resolve(process.env.STAGING_MOUNT ?? '/oc/staging')

// ジョブIDとして安全な文字のみ許可（パストラバーサル防止の根本対策）
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function sanitizeJobId(jobId: string): string {
  if (!SAFE_ID_PATTERN.test(jobId)) {
    throw new Error(`[SECURITY] Invalid job ID format: ${jobId}`)
  }
  return jobId
}

export function writeResult(jobId: string, content: string): string {
  const safeId = sanitizeJobId(jobId)

  if (!fs.existsSync(STAGING)) fs.mkdirSync(STAGING, { recursive: true })

  const filename = `result_${safeId}.md`
  const resolved = path.resolve(STAGING, filename)

  // パストラバーサル防止（多層防御）
  if (!resolved.startsWith(STAGING + path.sep)) {
    throw new Error(`[SECURITY] Write outside staging forbidden: ${resolved}`)
  }

  // 上書き禁止
  if (fs.existsSync(resolved)) {
    throw new Error(`[SECURITY] Overwrite forbidden: ${resolved}`)
  }

  fs.writeFileSync(resolved, content, { flag: 'wx', encoding: 'utf-8' })
  return resolved
}

export function stagingSummary() {
  if (!fs.existsSync(STAGING)) return { count: 0, files: [] as string[] }
  const files = fs.readdirSync(STAGING).filter(f => f.match(/\.(md|png|jpg|mp4|webp)$/))
  return { count: files.length, files: files.slice(-10) }
}
