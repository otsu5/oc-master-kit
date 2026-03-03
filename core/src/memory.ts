import os from 'node:os'

const CHECK_INTERVAL = 60_000  // 1分ごと
const MIN_FREE_GB = 1.5        // 残り1.5GB以下で警告
const CRITICAL_FREE_GB = 0.5   // 残り0.5GB以下でジョブ受付停止

let memoryPressure = false

export function isMemoryPressure(): boolean {
  return memoryPressure
}

export function getMemoryStatus() {
  const totalGB = os.totalmem() / (1024 ** 3)
  const freeGB = os.freemem() / (1024 ** 3)
  const usedPct = ((1 - freeGB / totalGB) * 100).toFixed(1)
  return { totalGB: +totalGB.toFixed(1), freeGB: +freeGB.toFixed(1), usedPct: +usedPct }
}

export function startMemoryMonitor() {
  const check = () => {
    const { freeGB, usedPct } = getMemoryStatus()

    if (freeGB < CRITICAL_FREE_GB) {
      memoryPressure = true
      console.error(`[MEM] 🔴 CRITICAL: ${freeGB.toFixed(1)}GB free (${usedPct}% used) — new jobs blocked`)
    } else if (freeGB < MIN_FREE_GB) {
      memoryPressure = false
      console.warn(`[MEM] 🟡 LOW: ${freeGB.toFixed(1)}GB free (${usedPct}% used)`)
    } else {
      memoryPressure = false
    }
  }

  check()
  setInterval(check, CHECK_INTERVAL)
  console.log(`[MEM] Monitor started (warn < ${MIN_FREE_GB}GB, block < ${CRITICAL_FREE_GB}GB)`)
}
