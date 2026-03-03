/**
 * プロンプトサニタイズ — LLMに渡す前に危険なパターンをブロック
 *
 * 設計思想:
 * - LangChain等のPython依存を入れない（TypeScriptプロジェクト）
 * - 軽量なルールベースフィルタで十分な防御
 * - Ollamaはローカル実行なのでリスクは低いが、多層防御として実装
 */

// ── 危険パターン定義 ──────────────────────────────────────
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // システムコマンド実行の試み
  { pattern: /(?:rm\s+-rf|del\s+\/[sq]|format\s+[a-z]:|mkfs|dd\s+if=)/i, reason: 'Destructive system command detected' },
  { pattern: /(?:sudo|chmod|chown|passwd|useradd|userdel)\s/i, reason: 'System administration command detected' },

  // ファイルシステム操作の試み（プロンプトインジェクション経由）
  { pattern: /(?:\/etc\/passwd|\/etc\/shadow|\.ssh\/|id_rsa|authorized_keys)/i, reason: 'Sensitive file path detected' },
  { pattern: /(?:C:\\Windows\\System32|%SystemRoot%|%APPDATA%)/i, reason: 'Windows system path detected' },

  // プロンプトインジェクション典型パターン
  { pattern: /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions/i, reason: 'Prompt injection attempt' },
  { pattern: /you\s+are\s+now\s+(?:DAN|jailbr(?:oken|eak)|unfiltered)/i, reason: 'Jailbreak attempt' },
  { pattern: /(?:system\s*prompt|hidden\s*instruction|secret\s*instruction)/i, reason: 'System prompt extraction attempt' },

  // ネットワーク攻撃の試み
  { pattern: /(?:curl|wget|fetch)\s+https?:\/\//i, reason: 'Network exfiltration attempt' },
  { pattern: /(?:nc\s+-[el]|ncat|netcat|socat)\s/i, reason: 'Reverse shell attempt' },

  // コード実行の試み
  { pattern: /(?:eval|exec|spawn|fork)\s*\(/i, reason: 'Code execution attempt' },
  { pattern: /<script[\s>]/i, reason: 'Script injection attempt' },
]

// ── 長さ制限 ─────────────────────────────────────────────
const MAX_PROMPT_LENGTH = 10_000 // 10K文字（Ollamaのctx: 40Kトークンに対して十分）

export interface SanitizeResult {
  safe: boolean
  sanitized: string
  blocked?: string
}

export function sanitizePrompt(input: string): SanitizeResult {
  // 長さチェック
  if (input.length > MAX_PROMPT_LENGTH) {
    return {
      safe: false,
      sanitized: '',
      blocked: `Prompt too long: ${input.length} chars (max ${MAX_PROMPT_LENGTH})`,
    }
  }

  // パターンマッチング
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(input)) {
      console.warn(`[SANITIZE] Blocked: ${reason} | input preview: ${input.slice(0, 80)}`)
      return {
        safe: false,
        sanitized: '',
        blocked: reason,
      }
    }
  }

  // 制御文字除去（null bytes等）
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return { safe: true, sanitized: cleaned }
}
