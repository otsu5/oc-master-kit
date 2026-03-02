# OC-Master v5 — Claude Code CLI 指示書

## プロジェクト概要

- ローカルPC（第6世代CPU、16GB RAM）でプライバシー100%守る
- **Ollama がメインエンジン（月$0）** — Claude APIは重量タスクのみ
- BUDGET.yml で日次/月次コスト制限を**コードレベルで強制**
- 画像/動画生成はRunPod委託（Phase4〜）
- Syncthing で生成物をスマホに自動配送（assets除外）
- rclone でバックアップ（Syncthing削除リスク対策）

## 絶対ルール（変更禁止）

1. **AI の書き込みは `/oc/staging` のみ**
2. **削除・移動・上書き禁止**（`flag: 'wx'` を維持）
3. **デフォルト agentType は `ollama`**（Claude APIは明示指定時のみ）
4. **外部公開禁止**（Tailscale VPN経由のみ・Core APIは127.0.0.1バインド）
5. **Syncthing にassetsをマウントしない**（削除伝播リスク）
6. **Core API は CORE_API_TOKEN で認証**

## アーキテクチャ

```
Telegram Bot（モバイル）
    ↓ Tailscale VPN
OC-Core :8787（Job Queue / Approval / Budget / Auth）
    ↓ Bearer Token認証
[Ollama :11434] ← デフォルト（月$0）
[Claude API]    ← 重量タスクのみ（BUDGET.yml制限）
[RunPod]        ← 画像生成（Phase4〜）
    ↓
/oc/staging → Syncthing → スマホ
                 ↓ rclone
              MEGA バックアップ

PC監視: OpenWebUI :3000 / Syncthing :8384
```

## コマンド

```bash
# 起動
docker compose up -d --build

# Ollamaモデル準備
bash scripts/ollama_setup.sh

# 状態確認
bash scripts/healthcheck.sh

# rcloneバックアップ（手動）
bash scripts/backup.sh
```

## フェーズ状況

- Phase 1: ✅ Ollama + Telegram + Core + Syncthing + rclone + Auth + Budget
- Phase 2: 🔜 Task Planner
- Phase 3: 🔜 Codex PRレビュー
- Phase 4: 🔜 RunPod ComfyUI
- Phase 5: 🔜 MiyabiDash iOS

## コード構成

```
oc-master-kit/
├── core/
│   └── src/
│       ├── index.ts          # Express API（エントリポイント）
│       ├── db.ts             # SQLite + 監査ログ + コスト記録
│       ├── adapters.ts       # AI Adapter層（Ollama/Claude/OpenAI/RunPod）
│       ├── runner.service.ts # ファイル書き込み（セキュリティ境界）
│       ├── auth.ts           # API認証ミドルウェア
│       ├── budget.ts         # BUDGET.yml読み込み + コスト制限
│       └── validate.ts       # Zodリクエストバリデーション
├── interfaces/telegram/
│   └── src/
│       ├── index.ts          # Telegram Bot（メインロジック）
│       ├── api.ts            # Core API クライアント（認証付き）
│       ├── auth.ts           # ユーザー認証
│       └── messages.ts       # メッセージテンプレート
├── docker-compose.yml
├── BUDGET.yml                # ← OC-Coreが読み込んで強制する
├── .env.example
└── .gitignore
```
