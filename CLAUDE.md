# OC-Master v5.1 — Claude Code CLI 指示書

## プロジェクト概要

- ローカルPC（第6世代CPU、16GB RAM）でプライバシー100%守る
- **Ollama がメインエンジン（月$0）** — Claude APIは重量タスクのみ
- BUDGET.yml で日次/月次コスト制限を**コードレベルで強制**
- Syncthing で生成物をスマホに自動配送（assets除外）
- rclone でバックアップ（Syncthing削除リスク対策）

## 絶対ルール（変更禁止）

1. **AI の書き込みは `/oc/staging` のみ**
2. **削除・移動・上書き禁止**（`flag: 'wx'` を維持）
3. **デフォルト agentType は `ollama`**（Claude APIは明示指定時のみ）
4. **外部公開禁止**（Core APIはDockerネットワーク内部のみ・ポート非公開）
5. **Syncthing にassetsをマウントしない**（削除伝播リスク）
6. **Core API は CORE_API_TOKEN で認証**
7. **run/cancel のadmin判定はCore側で強制**（Interface層を信用しない）

## アーキテクチャ

```
Telegram Bot（メイン指揮・承認・通知）
    ↓ Tailscale VPN
OC-Core :8787（内部のみ）
    ├── Bearer Token認証
    ├── Core側admin判定
    ├── プロンプトサニタイズ
    ├── メモリ監視
    └── BUDGET.yml予算強制
    ↓
[Ollama :11434] ← デフォルト（月$0）
[Claude API]    ← 重量タスクのみ
[RunPod]        ← 画像生成（Phase4〜）
    ↓
/oc/staging → Syncthing → スマホ
                 ↓ rclone → MEGA

Discord Bot（書庫モード・スレッド整理・閲覧）
PC監視: OpenWebUI :3000 / Syncthing :8384
```

## コード構成

```
oc-master-kit/
├── core/src/
│   ├── index.ts          # Express API
│   ├── db.ts             # SQLite + 監査 + コスト記録
│   ├── adapters.ts       # AI Adapter層
│   ├── runner.service.ts # ファイル書き込み境界
│   ├── auth.ts           # API認証 + Core側admin判定
│   ├── budget.ts         # BUDGET.yml予算強制
│   ├── validate.ts       # Zodバリデーション
│   ├── sanitize.ts       # プロンプトサニタイズ
│   └── memory.ts         # メモリ監視
├── interfaces/
│   ├── telegram/         # メイン指揮（ジョブ投入・承認）
│   └── discord/          # 書庫（スレッド整理・閲覧）
├── scripts/
│   ├── init.ps1          # Windows セットアップ（推奨）
│   ├── init.sh           # Linux セットアップ
│   └── ...
├── docker-compose.yml
├── BUDGET.yml
└── .gitignore
```

## コマンド

```bash
# Windows
powershell .\scripts\init.ps1
docker compose up -d --build

# Ollamaモデル準備
docker exec oc_ollama ollama pull qwen2.5-coder:7b
```
