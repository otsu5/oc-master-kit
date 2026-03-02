import type { AgentType } from './db.js'

// ── 統一インターフェース ──────────────────────────────────
export interface AIAdapter {
  generate(prompt: string): Promise<AIResult>
  name: string
  provider: string
  model: string
}

export interface AIResult {
  text: string
  costUsd: number
  tokensIn: number
  tokensOut: number
}

// ── リトライヘルパー ─────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  label: string,
  delayMs = 3000
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      if (attempt < maxRetries) {
        console.warn(`[${label}] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delayMs}ms...`)
        await new Promise(r => setTimeout(r, delayMs))
        delayMs *= 1.5 // exponential backoff
      }
    }
  }
  throw lastError!
}

// ══════════════════════════════════════════════════════════
//  Ollama Adapter — ローカルLLM（メイン・月$0）
// ══════════════════════════════════════════════════════════
class OllamaAdapter implements AIAdapter {
  readonly name = 'ollama'
  readonly provider = 'ollama'
  readonly model: string
  private baseUrl: string

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434'
    this.model = process.env.OLLAMA_MODEL_LIGHT ?? 'qwen2.5-coder:7b'
  }

  async generate(prompt: string): Promise<AIResult> {
    return withRetry(async () => {
      const { default: axios } = await import('axios')
      const res = await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.2,
            top_p: 0.9,
            num_ctx: 40000,
            num_predict: 2000,
          }
        },
        { timeout: 120_000 }
      )
      return {
        text: res.data.response ?? JSON.stringify(res.data),
        costUsd: 0,  // ローカル実行は無料
        tokensIn: res.data.prompt_eval_count ?? 0,
        tokensOut: res.data.eval_count ?? 0,
      }
    }, 2, 'Ollama')
  }
}

// ══════════════════════════════════════════════════════════
//  Claude Adapter — 重量タスクのみ（BUDGET.ymlで制御）
// ══════════════════════════════════════════════════════════
class ClaudeAdapter implements AIAdapter {
  readonly name: string
  readonly provider = 'claude'
  readonly model: string

  constructor(model = 'claude-sonnet-4-5') {
    this.model = model
    this.name = `claude-${model.split('-').slice(-1)[0]}`
  }

  async generate(prompt: string): Promise<AIResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey.startsWith('sk-ant-xxx')) {
      throw new Error('ANTHROPIC_API_KEY not set or is placeholder')
    }

    return withRetry(async () => {
      const { default: axios } = await import('axios')
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout: 120_000
        }
      )
      const usage = res.data.usage ?? {}
      // Sonnet: input $3/MTok, output $15/MTok (approximate)
      const costUsd = ((usage.input_tokens ?? 0) * 3 + (usage.output_tokens ?? 0) * 15) / 1_000_000
      return {
        text: res.data.content?.[0]?.text ?? JSON.stringify(res.data),
        costUsd,
        tokensIn: usage.input_tokens ?? 0,
        tokensOut: usage.output_tokens ?? 0,
      }
    }, 1, 'Claude')
  }
}

// ══════════════════════════════════════════════════════════
//  OpenAI Adapter — PRレビュー（Phase3〜）
// ══════════════════════════════════════════════════════════
class OpenAIAdapter implements AIAdapter {
  readonly name = 'openai'
  readonly provider = 'openai'
  readonly model = 'gpt-4o'

  async generate(prompt: string): Promise<AIResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    return withRetry(async () => {
      const { default: axios } = await import('axios')
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120_000
        }
      )
      const usage = res.data.usage ?? {}
      const costUsd = ((usage.prompt_tokens ?? 0) * 2.5 + (usage.completion_tokens ?? 0) * 10) / 1_000_000
      return {
        text: res.data.choices?.[0]?.message?.content ?? JSON.stringify(res.data),
        costUsd,
        tokensIn: usage.prompt_tokens ?? 0,
        tokensOut: usage.completion_tokens ?? 0,
      }
    }, 1, 'OpenAI')
  }
}

// ══════════════════════════════════════════════════════════
//  Miyabi Adapter — 自律実行（Phase2〜）
// ══════════════════════════════════════════════════════════
class MiyabiAdapter implements AIAdapter {
  readonly name = 'miyabi'
  readonly provider = 'miyabi'
  readonly model = 'miyabi-runtime'
  private baseUrl = process.env.MIYABI_BASE_URL ?? 'http://miyabi:9090'

  async generate(prompt: string): Promise<AIResult> {
    const { default: axios } = await import('axios')
    const res = await axios.post(
      `${this.baseUrl}/generate`,
      { prompt },
      { timeout: 180_000 }
    )
    return {
      text: res.data.text ?? JSON.stringify(res.data),
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ══════════════════════════════════════════════════════════
//  RunPod ComfyUI Adapter — 画像/動画生成（Phase4〜）
// ══════════════════════════════════════════════════════════
class RunPodAdapter implements AIAdapter {
  readonly name = 'runpod'
  readonly provider = 'runpod'
  readonly model = 'comfyui'
  private comfyUrl = process.env.RUNPOD_COMFYUI_URL ?? ''
  private dlDir    = process.env.RUNPOD_DOWNLOAD_DIR ?? '/oc/staging/generated'

  async generate(prompt: string): Promise<AIResult> {
    if (!this.comfyUrl) throw new Error('RUNPOD_COMFYUI_URL not set')

    const { default: axios } = await import('axios')
    const fs = await import('node:fs')
    const path = await import('node:path')

    const queueRes = await axios.post(
      `${this.comfyUrl}/prompt`,
      {
        prompt: {
          "3": {
            class_type: "KSampler",
            inputs: {
              cfg: 7, denoise: 1, model: ["4", 0],
              negative: ["7", 0], positive: ["6", 0],
              sampler_name: "euler", scheduler: "normal",
              seed: Math.floor(Math.random() * 999999999), steps: 20
            }
          },
          "6": { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: prompt } },
          "7": { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: "bad quality, blurry" } }
        }
      },
      { timeout: 30_000 }
    )

    const promptId = queueRes.data.prompt_id
    if (!promptId) throw new Error('ComfyUI: no prompt_id returned')

    let outputFile: string | null = null
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 10_000))
      const histRes = await axios.get(`${this.comfyUrl}/history/${promptId}`)
      const history = histRes.data[promptId]
      if (history?.outputs) {
        const outputs = Object.values(history.outputs) as any[]
        for (const output of outputs) {
          if (output.images?.[0]) { outputFile = output.images[0].filename; break }
        }
        if (outputFile) break
      }
    }
    if (!outputFile) throw new Error('ComfyUI: generation timeout')

    const imgRes = await axios.get(
      `${this.comfyUrl}/view?filename=${outputFile}`,
      { responseType: 'arraybuffer' }
    )

    if (!fs.existsSync(this.dlDir)) fs.mkdirSync(this.dlDir, { recursive: true })
    const localPath = path.join(this.dlDir, outputFile)
    fs.writeFileSync(localPath, Buffer.from(imgRes.data))

    // RunPod GPU cost: ~$0.34/hour, estimate ~30sec per image = ~$0.003
    return {
      text: `Generated: ${outputFile}\nPath: ${localPath}\n→ Syncthingが自動でスマホに配送します`,
      costUsd: 0.003,
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ══════════════════════════════════════════════════════════
//  Mock Adapter — Phase1動作確認用
// ══════════════════════════════════════════════════════════
class MockAdapter implements AIAdapter {
  readonly name = 'mock'
  readonly provider = 'mock'
  readonly model = 'mock-v1'

  async generate(prompt: string): Promise<AIResult> {
    const ts = new Date().toISOString()
    return {
      text: `# Mock Result\n\n**Timestamp**: ${ts}\n\n**Prompt**:\n${prompt.slice(0, 200)}\n\n---\n*Mock adapter — Phase1確認用*`,
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ── ルーター ─────────────────────────────────────────────
export function getAdapter(type: AgentType): AIAdapter {
  switch (type) {
    case 'ollama':   return new OllamaAdapter()
    case 'claude':   return new ClaudeAdapter('claude-sonnet-4-5')
    case 'opus':     return new ClaudeAdapter('claude-opus-4-5')
    case 'openai':   return new OpenAIAdapter()
    case 'miyabi':   return new MiyabiAdapter()
    case 'runpod':   return new RunPodAdapter()
    case 'mock':     return new MockAdapter()
    default:         return new OllamaAdapter()
  }
}
