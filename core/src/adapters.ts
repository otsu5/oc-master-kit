import type { AgentType } from './db.js'

// ── 統一インターフェース ──────────────────────────────────
export interface AIAdapter {
  generate(prompt: string): Promise<string>
  name: string
}

// ══════════════════════════════════════════════════════════
//  Ollama Adapter — ローカルLLM（メイン・月$0）
//  PDFの設計思想: 軽量タスクはすべてOllamaで処理
// ══════════════════════════════════════════════════════════
class OllamaAdapter implements AIAdapter {
  readonly name = 'ollama'
  private baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434'
  private model   = process.env.OLLAMA_MODEL_LIGHT ?? 'qwen2.5-coder:7b'

  async generate(prompt: string): Promise<string> {
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
          // ツールループ防止（PDFの失敗例より）
          num_predict: 2000,
        }
      },
      { timeout: 120_000 }
    )
    return res.data.response ?? JSON.stringify(res.data)
  }
}

// ══════════════════════════════════════════════════════════
//  Claude Adapter — 重量タスクのみ（BUDGET.ymlで制御）
//  PDFの設計思想: 設計・計画など高品質が必要なときだけ
// ══════════════════════════════════════════════════════════
class ClaudeAdapter implements AIAdapter {
  readonly name = 'claude'
  private model: string

  constructor(model = 'claude-sonnet-4-5') {
    this.model = model
  }

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

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
    return res.data.content?.[0]?.text ?? JSON.stringify(res.data)
  }
}

// ══════════════════════════════════════════════════════════
//  Miyabi Adapter — 自律実行（Phase2〜）
// ══════════════════════════════════════════════════════════
class MiyabiAdapter implements AIAdapter {
  readonly name = 'miyabi'
  private baseUrl = process.env.MIYABI_BASE_URL ?? 'http://miyabi:9090'

  async generate(prompt: string): Promise<string> {
    const { default: axios } = await import('axios')
    const res = await axios.post(
      `${this.baseUrl}/generate`,
      { prompt },
      { timeout: 180_000 }
    )
    return res.data.text ?? JSON.stringify(res.data)
  }
}

// ══════════════════════════════════════════════════════════
//  OpenAI / Codex Adapter — PRレビュー（Phase3〜）
// ══════════════════════════════════════════════════════════
class OpenAIAdapter implements AIAdapter {
  readonly name = 'openai'

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    const { default: axios } = await import('axios')
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
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
    return res.data.choices?.[0]?.message?.content ?? JSON.stringify(res.data)
  }
}

// ══════════════════════════════════════════════════════════
//  RunPod ComfyUI Adapter — 画像/動画生成（Phase4〜）
//  PDFのデータフロー:
//  Telegram指示 → OC-Core → RunPod ComfyUI → staging → Syncthing → スマホ
// ══════════════════════════════════════════════════════════
class RunPodAdapter implements AIAdapter {
  readonly name = 'runpod'
  private comfyUrl  = process.env.RUNPOD_COMFYUI_URL ?? ''
  private dlDir     = process.env.RUNPOD_DOWNLOAD_DIR ?? '/oc/staging/generated'

  async generate(prompt: string): Promise<string> {
    if (!this.comfyUrl) throw new Error('RUNPOD_COMFYUI_URL not set')

    const { default: axios } = await import('axios')
    const fs = await import('node:fs')
    const path = await import('node:path')

    // ComfyUIにプロンプト送信
    const queueRes = await axios.post(
      `${this.comfyUrl}/prompt`,
      {
        prompt: {
          "3": {
            class_type: "KSampler",
            inputs: {
              cfg: 7,
              denoise: 1,
              model: ["4", 0],
              negative: ["7", 0],
              positive: ["6", 0],
              sampler_name: "euler",
              scheduler: "normal",
              seed: Math.floor(Math.random() * 999999999),
              steps: 20
            }
          },
          "6": {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["4", 1], text: prompt }
          },
          "7": {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["4", 1], text: "bad quality, blurry" }
          }
        }
      },
      { timeout: 30_000 }
    )

    const promptId = queueRes.data.prompt_id
    if (!promptId) throw new Error('ComfyUI: no prompt_id returned')

    // 生成完了を待機（最大10分）
    let outputFile: string | null = null
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 10_000))
      const histRes = await axios.get(`${this.comfyUrl}/history/${promptId}`)
      const history = histRes.data[promptId]

      if (history?.outputs) {
        const outputs = Object.values(history.outputs) as any[]
        for (const output of outputs) {
          if (output.images?.[0]) {
            outputFile = output.images[0].filename
            break
          }
        }
        if (outputFile) break
      }
    }

    if (!outputFile) throw new Error('ComfyUI: generation timeout')

    // 生成物をダウンロードしてstaging保存（→Syncthingが自動でスマホに届ける）
    const imgRes = await axios.get(
      `${this.comfyUrl}/view?filename=${outputFile}`,
      { responseType: 'arraybuffer' }
    )

    if (!fs.existsSync(this.dlDir)) {
      fs.mkdirSync(this.dlDir, { recursive: true })
    }

    const localPath = path.join(this.dlDir, outputFile)
    fs.writeFileSync(localPath, Buffer.from(imgRes.data))

    return `Generated: ${outputFile}\nPath: ${localPath}\n→ Syncthingが自動でスマホに配送します`
  }
}

// ══════════════════════════════════════════════════════════
//  Mock Adapter — Phase1動作確認用
// ══════════════════════════════════════════════════════════
class MockAdapter implements AIAdapter {
  readonly name = 'mock'

  async generate(prompt: string): Promise<string> {
    const ts = new Date().toISOString()
    return `# Mock Result\n\n**Timestamp**: ${ts}\n\n**Prompt**:\n${prompt.slice(0, 200)}\n\n---\n*Mock adapter — Phase1確認用。Phase2でOllamaに切り替わります*`
  }
}

// ── ルーター ─────────────────────────────────────────────
export function getAdapter(type: AgentType): AIAdapter {
  switch (type) {
    // Ollamaが最優先（月$0・ローカル）
    case 'ollama':   return new OllamaAdapter()
    // 重量タスクのみClaudeへ
    case 'claude':   return new ClaudeAdapter('claude-sonnet-4-5')
    case 'opus':     return new ClaudeAdapter('claude-opus-4-5')
    // Phase3〜
    case 'openai':   return new OpenAIAdapter()
    // Phase2〜
    case 'miyabi':   return new MiyabiAdapter()
    // Phase4〜
    case 'runpod':   return new RunPodAdapter()
    // Phase1確認用
    case 'mock':     return new MockAdapter()
    // デフォルトはOllama（月$0）
    default:         return new OllamaAdapter()
  }
}
