# OC-Master v5.2

**ローカルAIエージェント基盤** — Miyabi整流 + GLM/Groq/Ollama + Telegram + Discord + Syncthing

```
Telegram = 指揮官  |  Miyabi = 整流  |  Discord = 書庫
GLM-Flash = 日常無料  |  Groq = 高速  |  GLM-5 = 重量級
```

## アーキテクチャ

```
📱 Telegram（/add テキスト → ジョブ投入・承認・通知）
       ↓ Tailscale VPN
⚙️  OC-Core :8787（内部のみ）
  ├── Bearer Token認証 + Core側admin判定
  ├── プロンプトサニタイズ + メモリ監視
  └── BUDGET.yml予算強制
       ↓ AI Adapter 4層ルーティング
  Tier 0: GLM-4.7-Flash   $0（デフォルト・完全無料）
  Tier 1: Ollama ローカル  $0（オフライン用）
  Tier 2: Groq Llama 70B   ~$0.7/M（爆速276tok/s）
  Tier 3: GLM-5            ~$1-3.2/M（自律Agent・設計）
       ↓
  🎯 Miyabi（整流・オーケストレーション・MCP）
       ↓
  📁 staging → 🔄 Syncthing → 📱 スマホ
  💬 Discord（!oc list → スレッドで結果閲覧）
```

## クイックスタート

```powershell
# Windows
.\scripts\init.ps1

# .env 編集: ZAI_API_KEY, GROQ_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_IDS
docker compose up -d --build

# Telegramで
/add 最新のAI論文を要約して          ← GLM-Flash（無料）
/add コードレビューお願い groq        ← Groq（爆速）
/add システム設計書を作成 glm-5       ← GLM-5（重量級）
/add 全自動でIssue処理 miyabi        ← Miyabi整流
```

## コスト試算

| 使い方 | 月額 |
|---|---|
| GLM-Flashのみ（日常） | **$0** |
| Flash + Groq 50回/月 | **~$2** |
| Flash + Groq + GLM-5 10回/月 | **~$5** |
| 上記 + Ollama オフライン | **~$5** |

## セキュリティ

Core側admin判定、ポート非公開、プロンプトサニタイズ、メモリ監視、Bearer認証、BUDGET.yml予算強制、staging限定書き込み、Tailscale VPN。

## 詳細

- [フェーズ計画](docs/PHASES.md) | [セキュリティ](docs/SECURITY.md) | [Claude Code用](CLAUDE.md)
