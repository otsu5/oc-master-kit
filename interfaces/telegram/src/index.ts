import TelegramBot from 'node-telegram-bot-api'
import { api } from './api.js'
import { isAdmin, isAllowed } from './auth.js'
import {
  msgQueued, msgRunning, msgDone, msgError,
  msgCancelled, msgJobList, msgJobDetail,
  msgStatus, msgHelp, msgAgentMenu
} from './messages.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) { console.error('[TG] TELEGRAM_BOT_TOKEN required'); process.exit(1) }

const bot = new TelegramBot(token, { polling: true })
console.log('[TG] Bot started')

const reply      = (cid: number, text: string) => bot.sendMessage(cid, text, { parse_mode: 'MarkdownV2' })
const replyPlain = (cid: number, text: string) => bot.sendMessage(cid, text)

// 承認ボタン付き送信
const replyWithApproval = (cid: number, jobId: string, text: string) =>
  bot.sendMessage(cid, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ 実行承認', callback_data: `run:${jobId}` },
        { text: '❌ キャンセル', callback_data: `cancel:${jobId}` }
      ]]
    }
  })

// ══════════════════════════════════════════════════════════
//  /start /help
// ══════════════════════════════════════════════════════════
bot.onText(/^\/start$|^\/help$/, async (msg) => {
  const uid = msg.from?.id
  if (!uid || !isAllowed(uid)) return replyPlain(msg.chat.id, '⛔ アクセス権限なし')
  await reply(msg.chat.id, msgHelp(isAdmin(uid)))
})

// ══════════════════════════════════════════════════════════
//  /add <text> [agent]
//  例: /add ObsidianVaultを要約して
//  例: /add 画像生成: 富士山 runpod
//  デフォルトagentType: ollama（月$0）
// ══════════════════════════════════════════════════════════
bot.onText(/^\/add (.+)$/s, async (msg, match) => {
  const uid = msg.from?.id
  if (!uid || !isAllowed(uid)) return replyPlain(msg.chat.id, '⛔ アクセス権限なし')

  const input = match?.[1]?.trim()
  if (!input) return replyPlain(msg.chat.id, '使い方: /add <内容> [ollama|claude|runpod]')

  // 末尾のagentType指定を解析
  const validAgents = ['ollama', 'claude', 'opus', 'openai', 'miyabi', 'runpod', 'mock']
  const parts = input.split(' ')
  const lastWord = parts[parts.length - 1].toLowerCase()
  const agentType = validAgents.includes(lastWord) ? lastWord : 'ollama'  // デフォルトollama
  const text = agentType !== 'ollama' || validAgents.includes(lastWord) && lastWord !== parts.join(' ')
    ? parts.slice(0, -1).join(' ') || input
    : input

  const finalText  = validAgents.includes(lastWord) ? parts.slice(0, -1).join(' ') : input
  const finalAgent = validAgents.includes(lastWord) ? lastWord : 'ollama'

  try {
    const job = await api.addJob(finalText || input, String(uid), finalAgent)
    const msgText = msgQueued({ id: job.id, text: finalText || input, agentType: finalAgent })

    if (isAdmin(uid)) {
      await replyWithApproval(msg.chat.id, job.id, msgText)
    } else {
      await reply(msg.chat.id, msgText)
    }
  } catch (e: any) {
    await replyPlain(msg.chat.id, `❌ エラー: ${e.message}`)
  }
})

// ══════════════════════════════════════════════════════════
//  /list — ジョブ一覧
// ══════════════════════════════════════════════════════════
bot.onText(/^\/list$/, async (msg) => {
  const uid = msg.from?.id
  if (!uid || !isAllowed(uid)) return
  try {
    const jobs = await api.listJobs()
    await reply(msg.chat.id, msgJobList(jobs))
  } catch (e: any) {
    await replyPlain(msg.chat.id, `❌ ${e.message}`)
  }
})

// ══════════════════════════════════════════════════════════
//  /job <id> — ジョブ詳細
// ══════════════════════════════════════════════════════════
bot.onText(/^\/job (.+)$/, async (msg, match) => {
  const uid = msg.from?.id
  if (!uid || !isAllowed(uid)) return
  const id = match?.[1]?.trim()
  if (!id) return replyPlain(msg.chat.id, '使い方: /job <id>')
  try {
    const job = await api.getJob(id)
    await reply(msg.chat.id, msgJobDetail(job))
    if (job.status === 'PENDING' && isAdmin(uid)) {
      await bot.sendMessage(msg.chat.id, '承認しますか？', {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 実行', callback_data: `run:${id}` },
            { text: '❌ キャンセル', callback_data: `cancel:${id}` }
          ]]
        }
      })
    }
  } catch (e: any) {
    await replyPlain(msg.chat.id, `❌ 見つかりません: ${id}`)
  }
})

// ══════════════════════════════════════════════════════════
//  /run <id> — 実行承認（管理者のみ）
// ══════════════════════════════════════════════════════════
bot.onText(/^\/run (.+)$/, async (msg, match) => {
  const uid = msg.from?.id
  if (!uid || !isAdmin(uid)) return replyPlain(msg.chat.id, '⛔ 管理者権限が必要')
  const id = match?.[1]?.trim()
  if (!id) return replyPlain(msg.chat.id, '使い方: /run <id>')
  await replyPlain(msg.chat.id, `🔥 実行中: ${id}`)
  try {
    await api.runJob(id, String(uid))
    await pollJobResult(msg.chat.id, id)
  } catch (e: any) {
    await replyPlain(msg.chat.id, `❌ ${e.message}`)
  }
})

// ══════════════════════════════════════════════════════════
//  /cancel <id>
// ══════════════════════════════════════════════════════════
bot.onText(/^\/cancel (.+)$/, async (msg, match) => {
  const uid = msg.from?.id
  if (!uid || !isAdmin(uid)) return replyPlain(msg.chat.id, '⛔ 管理者権限が必要')
  const id = match?.[1]?.trim()
  if (!id) return
  try {
    await api.cancelJob(id, String(uid))
    await reply(msg.chat.id, msgCancelled(id))
  } catch (e: any) {
    await replyPlain(msg.chat.id, `❌ ${e.message}`)
  }
})

// ══════════════════════════════════════════════════════════
//  /status — システム状態
// ══════════════════════════════════════════════════════════
bot.onText(/^\/status$/, async (msg) => {
  const uid = msg.from?.id
  if (!uid || !isAdmin(uid)) return replyPlain(msg.chat.id, '⛔ 管理者権限が必要')
  try {
    const s = await api.status()
    await reply(msg.chat.id, msgStatus(s))
  } catch (e: any) {
    await replyPlain(msg.chat.id, `❌ Core接続エラー: ${e.message}`)
  }
})

// ══════════════════════════════════════════════════════════
//  Inline Button コールバック
// ══════════════════════════════════════════════════════════
bot.on('callback_query', async (query) => {
  const uid    = query.from.id
  const chatId = query.message?.chat.id
  const data   = query.data ?? ''
  const msgId  = query.message?.message_id
  if (!chatId) return
  await bot.answerCallbackQuery(query.id)

  if (data.startsWith('run:')) {
    if (!isAdmin(uid)) return replyPlain(chatId, '⛔ 管理者権限が必要')
    const jobId = data.slice(4)
    if (msgId) {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '🔥 実行中...', callback_data: 'noop' }]] },
        { chat_id: chatId, message_id: msgId }
      ).catch(() => {})
    }
    try {
      await api.runJob(jobId, String(uid))
      await reply(chatId, msgRunning(jobId))
      await pollJobResult(chatId, jobId, msgId)
    } catch (e: any) {
      await replyPlain(chatId, `❌ ${e.message}`)
    }
  }

  if (data.startsWith('cancel:')) {
    if (!isAdmin(uid)) return replyPlain(chatId, '⛔ 管理者権限が必要')
    const jobId = data.slice(7)
    try {
      await api.cancelJob(jobId, String(uid))
      if (msgId) {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: '🚫 キャンセル済み', callback_data: 'noop' }]] },
          { chat_id: chatId, message_id: msgId }
        ).catch(() => {})
      }
      await reply(chatId, msgCancelled(jobId))
    } catch (e: any) {
      await replyPlain(chatId, `❌ ${e.message}`)
    }
  }
})

// ── ジョブ完了ポーリング（最大10分）─────────────────────
async function pollJobResult(chatId: number, jobId: string, originalMsgId?: number) {
  const MAX = 120; const INTERVAL = 5000
  for (let i = 0; i < MAX; i++) {
    await new Promise(r => setTimeout(r, INTERVAL))
    try {
      const job = await api.getJob(jobId)
      if (job.status === 'DONE') {
        if (originalMsgId) {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: '✅ 完了', callback_data: 'noop' }]] },
            { chat_id: chatId, message_id: originalMsgId }
          ).catch(() => {})
        }
        await reply(chatId, msgDone(jobId, job.result_path ?? ''))
        return
      }
      if (job.status === 'ERROR')     { await reply(chatId, msgError(jobId, job.error ?? '')); return }
      if (job.status === 'CANCELLED') { return }
    } catch {}
  }
  await replyPlain(chatId, `⏱ タイムアウト: ${jobId}\n/job ${jobId} で状態確認`)
}

bot.on('polling_error', err => console.error('[TG] Polling error:', err.message))
process.on('SIGTERM', () => { bot.stopPolling(); process.exit(0) })
console.log('[TG] Ready.')
