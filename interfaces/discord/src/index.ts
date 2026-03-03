/**
 * OC-Master Discord Bot — 情報整理・アーカイブUI
 *
 * 役割:
 * - Telegramがメイン指揮（ジョブ投入・承認・通知）
 * - Discordは「書庫」（スレッド形式でジョブ結果を整理・閲覧）
 *
 * 機能:
 * - !oc list    — 最新ジョブ一覧をEmbed表示
 * - !oc job <id> — ジョブ詳細をスレッドで表示
 * - !oc status  — システム状態（予算・メモリ・ジョブ数）
 * - !oc archive — 完了ジョブをスレッドに整理
 *
 * 設計思想:
 * - Discordはread-heavy（閲覧・検索が主）
 * - ジョブ実行・承認はTelegramに任せる（Discordからのrun/cancelは意図的に除外）
 * - スレッドでトピック別に結果を整理 = 「書庫」
 */

import {
  Client, GatewayIntentBits, EmbedBuilder, ChannelType,
  type TextChannel, type Message
} from 'discord.js'
import { api, type Job } from './api.js'
import fs from 'node:fs'

const token = process.env.DISCORD_BOT_TOKEN
if (!token) { console.error('[DC] DISCORD_BOT_TOKEN required'); process.exit(1) }

const ARCHIVE_CHANNEL = process.env.DISCORD_ARCHIVE_CHANNEL ?? 'oc-archive'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
})

// ── Embed ヘルパー ───────────────────────────────────────
const STATUS_COLOR: Record<string, number> = {
  PENDING:   0xFFA500, // orange
  RUNNING:   0x3498DB, // blue
  DONE:      0x2ECC71, // green
  ERROR:     0xE74C3C, // red
  CANCELLED: 0x95A5A6, // gray
}

const STATUS_ICON: Record<string, string> = {
  PENDING: '⏳', RUNNING: '🔥', DONE: '✅', ERROR: '❌', CANCELLED: '🚫'
}

function jobEmbed(job: Job): EmbedBuilder {
  const created = new Date(job.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const embed = new EmbedBuilder()
    .setTitle(`${STATUS_ICON[job.status] ?? '❓'} Job: ${job.id}`)
    .setColor(STATUS_COLOR[job.status] ?? 0x000000)
    .addFields(
      { name: '📊 Status', value: job.status, inline: true },
      { name: '🤖 Agent', value: job.agent_type, inline: true },
      { name: '🕐 Created', value: created, inline: true },
      { name: '📝 Content', value: job.text.slice(0, 1000) || '(empty)' },
    )
    .setTimestamp()

  if (job.error) {
    embed.addFields({ name: '💥 Error', value: job.error.slice(0, 500) })
  }
  if (job.result_path) {
    const filename = job.result_path.split('/').pop() ?? job.result_path
    embed.addFields({ name: '📄 Result', value: `\`${filename}\`` })
  }

  return embed
}

// ── コマンドハンドラ ─────────────────────────────────────
client.on('messageCreate', async (msg: Message) => {
  if (msg.author.bot) return
  if (!msg.content.startsWith('!oc')) return

  const parts = msg.content.split(/\s+/)
  const sub = parts[1]?.toLowerCase()

  try {
    switch (sub) {
      case 'list':    return await handleList(msg)
      case 'job':     return await handleJob(msg, parts[2])
      case 'status':  return await handleStatus(msg)
      case 'archive': return await handleArchive(msg)
      case 'help':    return await handleHelp(msg)
      default:        return await handleHelp(msg)
    }
  } catch (e: any) {
    await msg.reply(`❌ Error: ${e.message}`)
  }
})

// ── !oc list ─────────────────────────────────────────────
async function handleList(msg: Message) {
  const jobs = await api.listJobs()
  if (jobs.length === 0) {
    await msg.reply('📭 未処理ジョブなし')
    return
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Job List')
    .setColor(0x3498DB)
    .setDescription(
      jobs.map(j =>
        `${STATUS_ICON[j.status] ?? '❓'} \`${j.id}\` [${j.agent_type}] ${j.text.slice(0, 60)}`
      ).join('\n')
    )
    .setFooter({ text: `${jobs.length} jobs | Telegramで承認: /run <id>` })
    .setTimestamp()

  await msg.reply({ embeds: [embed] })
}

// ── !oc job <id> — スレッドで詳細表示 ───────────────────
async function handleJob(msg: Message, id?: string) {
  if (!id) { await msg.reply('使い方: `!oc job <id>`'); return }

  const job = await api.getJob(id)
  const embed = jobEmbed(job)

  const reply = await msg.reply({ embeds: [embed] })

  // スレッドを作成（既存スレッドがなければ）
  if (msg.channel.type === ChannelType.GuildText) {
    const thread = await reply.startThread({
      name: `📄 ${job.id} — ${job.text.slice(0, 50)}`,
      autoArchiveDuration: 1440, // 24時間後自動アーカイブ
    })

    // 結果ファイルがあれば内容を投稿
    if (job.result_path && fs.existsSync(job.result_path)) {
      const content = fs.readFileSync(job.result_path, 'utf-8')
      const chunks = splitMessage(content, 1900)
      for (const chunk of chunks) {
        await thread.send(`\`\`\`markdown\n${chunk}\n\`\`\``)
      }
    } else if (job.status === 'DONE') {
      await thread.send('📄 結果ファイルはSyncthing経由でスマホに配送済み')
    }
  }
}

// ── !oc status — システム状態 ────────────────────────────
async function handleStatus(msg: Message) {
  const s = await api.status()
  const jobLines = Object.entries(s.jobs).map(([k, v]) => `${STATUS_ICON[k] ?? '❓'} ${k}: **${v}**`).join('\n') || 'なし'
  const b = s.budget
  const m = s.memory

  const embed = new EmbedBuilder()
    .setTitle('📊 System Status')
    .setColor(m.freeGB < 2 ? 0xE74C3C : 0x2ECC71)
    .addFields(
      { name: '📋 Jobs', value: jobLines, inline: false },
      { name: '💰 Budget (Daily)', value: `$${b.daily.used.toFixed(2)} / $${b.daily.limit.toFixed(2)}`, inline: true },
      { name: '💰 Budget (Monthly)', value: `$${b.monthly.used.toFixed(2)} / $${b.monthly.limit.toFixed(2)}`, inline: true },
      { name: '🧠 Memory', value: `${m.freeGB}GB free / ${m.totalGB}GB (${m.usedPct}% used)`, inline: false },
      { name: '📁 Staging', value: `${s.staging.count} files`, inline: true },
    )
    .setFooter({ text: 'Telegramで指揮 | Discordで確認' })
    .setTimestamp()

  await msg.reply({ embeds: [embed] })
}

// ── !oc archive — 完了ジョブをスレッドに整理 ────────────
async function handleArchive(msg: Message) {
  const jobs = await api.listJobs('DONE')
  if (jobs.length === 0) {
    await msg.reply('📭 アーカイブ対象の完了ジョブなし')
    return
  }

  // アーカイブチャンネルを探す（なければ現在のチャンネル）
  const guild = msg.guild
  if (!guild) return

  let archiveChannel = guild.channels.cache.find(
    ch => ch.name === ARCHIVE_CHANNEL && ch.type === ChannelType.GuildText
  ) as TextChannel | undefined

  if (!archiveChannel) {
    archiveChannel = msg.channel as TextChannel
  }

  let archived = 0
  for (const job of jobs.slice(0, 10)) {
    const embed = jobEmbed(job)
    const posted = await archiveChannel.send({ embeds: [embed] })

    await posted.startThread({
      name: `📄 ${job.id} — ${job.text.slice(0, 50)}`,
      autoArchiveDuration: 10080, // 7日
    })
    archived++
  }

  await msg.reply(`📚 ${archived}件をアーカイブしました → #${archiveChannel.name}`)
}

// ── !oc help ─────────────────────────────────────────────
async function handleHelp(msg: Message) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 OC-Master Discord（書庫モード）')
    .setColor(0x3498DB)
    .setDescription([
      '**Discordは「書庫」— 情報整理・閲覧用**',
      '**Telegramがメイン指揮 — ジョブ投入・承認**',
      '',
      '`!oc list` — 最新ジョブ一覧',
      '`!oc job <id>` — ジョブ詳細（スレッド展開）',
      '`!oc status` — システム状態（予算・メモリ）',
      '`!oc archive` — 完了ジョブをスレッド整理',
      '`!oc help` — このヘルプ',
      '',
      '⚠️ ジョブ実行・承認はTelegramから:',
      '`/add <内容>` → `/run <id>`',
    ].join('\n'))
    .setTimestamp()

  await msg.reply({ embeds: [embed] })
}

// ── ユーティリティ ───────────────────────────────────────
function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen))
  }
  return chunks
}

// ── 起動 ─────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`[DC] Logged in as ${client.user?.tag}`)
  console.log(`[DC] Archive channel: #${ARCHIVE_CHANNEL}`)
  console.log(`[DC] Mode: 📚 Library/Archive (read-only, no run/cancel)`)
})

client.login(token)

process.on('SIGTERM', () => { client.destroy(); process.exit(0) })
