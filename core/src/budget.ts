import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { db } from './db.js'

// ── BUDGET.yml の型定義 ──────────────────────────────────
interface BudgetConfig {
  daily_limit_usd: number
  monthly_limit_usd: number
  alert_threshold: number
}

const DEFAULT_BUDGET: BudgetConfig = {
  daily_limit_usd: 5.00,
  monthly_limit_usd: 50.00,
  alert_threshold: 0.8,
}

let cachedBudget: BudgetConfig | null = null
let lastLoaded = 0
const RELOAD_INTERVAL = 60_000 // 1分ごとに再読み込み

function loadBudget(): BudgetConfig {
  const now = Date.now()
  if (cachedBudget && now - lastLoaded < RELOAD_INTERVAL) return cachedBudget

  const candidates = [
    path.resolve('/oc/BUDGET.yml'),
    path.resolve(process.cwd(), 'BUDGET.yml'),
    path.resolve(process.cwd(), '..', 'BUDGET.yml'),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8')
        const parsed = YAML.parse(raw)
        cachedBudget = {
          daily_limit_usd: parsed.daily_limit_usd ?? DEFAULT_BUDGET.daily_limit_usd,
          monthly_limit_usd: parsed.monthly_limit_usd ?? DEFAULT_BUDGET.monthly_limit_usd,
          alert_threshold: parsed.alert_threshold ?? DEFAULT_BUDGET.alert_threshold,
        }
        lastLoaded = now
        return cachedBudget
      } catch (e) {
        console.warn(`[BUDGET] Failed to parse ${p}:`, e)
      }
    }
  }

  cachedBudget = DEFAULT_BUDGET
  lastLoaded = now
  return cachedBudget
}

// ── コスト集計 ───────────────────────────────────────────
function getTodayCost(): number {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const row = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_log WHERE timestamp >= ?`
  ).get(startOfDay.getTime()) as { total: number }
  return row.total
}

function getMonthCost(): number {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const row = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_log WHERE timestamp >= ?`
  ).get(startOfMonth.getTime()) as { total: number }
  return row.total
}

// ── 予算チェック ─────────────────────────────────────────
export interface BudgetCheckResult {
  allowed: boolean
  reason?: string
  dailyCost: number
  monthlyCost: number
  dailyLimit: number
  monthlyLimit: number
  warning?: string
}

export function checkBudget(provider: string): BudgetCheckResult {
  // Ollamaはローカル実行なのでコスト0 → 常に許可
  if (provider === 'ollama' || provider === 'mock') {
    return {
      allowed: true,
      dailyCost: getTodayCost(),
      monthlyCost: getMonthCost(),
      dailyLimit: loadBudget().daily_limit_usd,
      monthlyLimit: loadBudget().monthly_limit_usd,
    }
  }

  const budget = loadBudget()
  const dailyCost = getTodayCost()
  const monthlyCost = getMonthCost()

  const result: BudgetCheckResult = {
    allowed: true,
    dailyCost,
    monthlyCost,
    dailyLimit: budget.daily_limit_usd,
    monthlyLimit: budget.monthly_limit_usd,
  }

  if (dailyCost >= budget.daily_limit_usd) {
    result.allowed = false
    result.reason = `日次予算上限に到達 ($${dailyCost.toFixed(2)} / $${budget.daily_limit_usd})`
    return result
  }

  if (monthlyCost >= budget.monthly_limit_usd) {
    result.allowed = false
    result.reason = `月次予算上限に到達 ($${monthlyCost.toFixed(2)} / $${budget.monthly_limit_usd})`
    return result
  }

  // 警告閾値チェック
  const dailyRatio = dailyCost / budget.daily_limit_usd
  const monthlyRatio = monthlyCost / budget.monthly_limit_usd
  if (dailyRatio >= budget.alert_threshold || monthlyRatio >= budget.alert_threshold) {
    result.warning = `⚠️ 予算${Math.round(Math.max(dailyRatio, monthlyRatio) * 100)}%消化中`
  }

  return result
}

export function getBudgetSummary() {
  const budget = loadBudget()
  return {
    daily: { used: getTodayCost(), limit: budget.daily_limit_usd },
    monthly: { used: getMonthCost(), limit: budget.monthly_limit_usd },
  }
}
