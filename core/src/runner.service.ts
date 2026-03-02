import fs from 'node:fs'
import path from 'node:path'

const STAGING = path.resolve(process.env.STAGING_MOUNT ?? '/oc/staging')

export function writeResult(jobId: string, content: string): string {
  if (!fs.existsSync(STAGING)) fs.mkdirSync(STAGING, { recursive: true })

  const filename = `result_${jobId}.md`
  const resolved = path.resolve(STAGING, filename)

  // パストラバーサル防止
  if (!resolved.startsWith(STAGING + path.sep) && resolved !== STAGING) {
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
