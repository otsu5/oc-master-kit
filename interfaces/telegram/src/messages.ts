import type { Job, StatusSummary } from './api.js'

const jst = () => new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

const agentIcon: Record<string, string> = {
  ollama:  '🦙 Ollama（ローカル・無料）',
  claude:  '🤖 Claude Sonnet',
  opus:    '🧠 Claude Opus',
  openai:  '🔵 GPT-4o',
  miyabi:  '🌸 Miyabi',
  runpod:  '⚡ RunPod ComfyUI',
  mock:    '🎭 Mock',
}

export function msgQueued(job: { id: string; text: string; agentType?: string }) {
  const agent = agentIcon[job.agentType ?? 'ollama'] ?? '🦙 Ollama'
  return `👀 *Job Queued*
━━━━━━━━━━━━━━
🆔 \`${job.id}\`
📝 ${esc(job.text.slice(0, 100))}
🤖 ${esc(agent)}
📊 PENDING
🕐 ${jst()}
━━━━━━━━━━━━━━
_管理者が_ \`/run ${job.id}\` _で承認_`
}

export function msgRunning(jobId: string) {
  return `🔥 *Running\\.\\.\\.*
🆔 \`${jobId}\`
🕐 ${jst()}`
}

export function msgDone(jobId: string, resultPath: string) {
  const f = resultPath.split('/').pop() ?? resultPath
  return `🎉 *Job Complete\\!*
━━━━━━━━━━━━━━
🆔 \`${jobId}\`
✅ 完了
📄 \`${esc(f)}\`
📱 _Syncthingがスマホに配送中_
🕐 ${jst()}`
}

export function msgError(jobId: string, error: string) {
  return `❌ *Job Failed*
🆔 \`${jobId}\`
💥 ${esc(error.slice(0, 200))}
🕐 ${jst()}`
}

export function msgCancelled(jobId: string) {
  return `🚫 *Cancelled*
🆔 \`${jobId}\`
🕐 ${jst()}`
}

export function msgJobDetail(job: Job) {
  const icon: Record<string, string> = { PENDING:'⏳', RUNNING:'🔥', DONE:'✅', ERROR:'❌', CANCELLED:'🚫' }
  const created = new Date(job.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const agent   = agentIcon[job.agent_type] ?? job.agent_type
  return `${icon[job.status] ?? '❓'} *Job Detail*
━━━━━━━━━━━━━━
🆔 \`${job.id}\`
📊 ${job.status}
🤖 ${esc(agent)}
📝 ${esc(job.text.slice(0, 120))}
🕐 ${esc(created)}${job.error ? `\n💥 ${esc(job.error.slice(0, 150))}` : ''}${job.result_path ? `\n📄 \`${esc(job.result_path.split('/').pop() ?? '')}\`` : ''}`
}

export function msgJobList(jobs: Job[]) {
  if (jobs.length === 0) return '📭 *未処理ジョブなし*\n`/add <内容>` でジョブ追加'
  const icon: Record<string, string> = { PENDING:'⏳', RUNNING:'🔥', DONE:'✅', ERROR:'❌', CANCELLED:'🚫' }
  const lines = jobs.map(j =>
    `${icon[j.status] ?? '❓'} \`${j.id}\` \\[${esc(j.agent_type)}\\]\n   ${esc(j.text.slice(0, 50))}`
  ).join('\n\n')
  return `📋 *Job List \\(${jobs.length}件\\)*\n━━━━━━━━━━━━━━\n${lines}`
}

export function msgStatus(s: StatusSummary) {
  const jobLines = Object.entries(s.jobs).map(([k, v]) => `  ${k}: ${v}`).join('\n') || '  なし'
  const fileLines = s.staging.files.slice(-5).map(f => `  📄 ${esc(f)}`).join('\n') || '  なし'
  return `📊 *System Status*
━━━━━━━━━━━━━━
*Jobs:*
${esc(jobLines)}
*Staging \\(${s.staging.count}件\\):*
${fileLines}
📱 _Syncthingが自動配送中_
🕐 ${jst()}`
}

export function msgHelp(isAdmin: boolean) {
  const adminPart = isAdmin ? `
*管理者コマンド:*
\`/run <id>\` — 実行承認
\`/cancel <id>\` — キャンセル
\`/status\` — システム状態` : ''

  return `🤖 *OC\\-Master v4*
━━━━━━━━━━━━━━
*基本コマンド:*
\`/add <内容>\` — Ollamaでジョブ追加
\`/add <内容> claude\` — Claude指定
\`/add <内容> runpod\` — 画像生成
\`/list\` — ジョブ一覧
\`/job <id>\` — 詳細
\`/help\` — このヘルプ
${adminPart}
━━━━━━━━━━━━━━
🦙 _Default: Ollama（ローカル・月\\$0）_
🌸 _Powered by Miyabi_`
}

export function msgAgentMenu(jobId: string) {
  return `🤖 エージェントを選択してください:`
}

function esc(s: string) {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
