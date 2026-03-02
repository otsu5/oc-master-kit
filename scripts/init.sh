#!/usr/bin/env bash
# OC-Master v4 — 初期セットアップ（PDF設計準拠）
set -euo pipefail

[ ! -f .env ] && cp .env.example .env && echo "✅ .env を作成しました"
source .env

# WindowsパスをWSL2パスに変換
if [[ "$OC_ROOT" =~ ^[Cc]:\\ ]]; then
  OC_PATH=$(echo "$OC_ROOT" | sed 's|\\|/|g' | sed 's|^\([Cc]\):|/mnt/\L\1|')
else
  OC_PATH="$OC_ROOT"
fi

echo "📁 OC_PATH: $OC_PATH"

# ── ディレクトリ作成 ─────────────────────────────────────
mkdir -p "$OC_PATH/inbox_raw"          # 入力（読み取りのみ）
mkdir -p "$OC_PATH/staging"            # AI唯一の書き込み先
mkdir -p "$OC_PATH/staging/generated"  # RunPod生成物（→Syncthing→スマホ）
mkdir -p "$OC_PATH/assets"             # 原本（追記のみ）
mkdir -p "$OC_PATH/processed"          # 退避
mkdir -p "$OC_PATH/ObsidianVault"      # 成果物
mkdir -p "$OC_PATH/agent/queue"        # SQLite DB
mkdir -p "$OC_PATH/agent/logs"         # 監査ログ
mkdir -p "$OC_PATH/agent/backups"      # Vaultバックアップ

echo ""
echo "✅ ディレクトリ構成完了:"
echo "  $OC_PATH/"
echo "  ├── inbox_raw/          (入力専用)"
echo "  ├── staging/            (AI書き込み先・Syncthingが同期)"
echo "  │   └── generated/     (RunPod生成物→スマホ自動配送)"
echo "  ├── assets/             (原本保存)"
echo "  ├── ObsidianVault/      (成果物・Git管理)"
echo "  └── agent/"
echo "      ├── queue/          (SQLite DB)"
echo "      ├── logs/           (監査ログ)"
echo "      └── backups/        (Vaultバックアップ)"
echo ""

# ── Ollamaモデル事前ダウンロード ─────────────────────────
echo "🦙 Ollamaモデルをダウンロードしますか？ (y/N)"
read -r PULL
if [[ "$PULL" =~ ^[Yy]$ ]]; then
  echo "📥 qwen2.5-coder:7b ダウンロード中..."
  docker exec oc_ollama ollama pull qwen2.5-coder:7b || \
    echo "⚠️  コンテナ起動後に: docker exec oc_ollama ollama pull qwen2.5-coder:7b"
fi

echo ""
echo "📝 次のステップ:"
echo "  1. .env を編集（TELEGRAM_BOT_TOKEN 必須）"
echo "  2. docker compose up -d --build"
echo "  3. Syncthing管理画面: http://localhost:8384"
echo "     → スマホとペアリング → staging フォルダを共有"
echo "  4. Telegram で /start"
echo "  5. /add テストジョブ（デフォルト: Ollama）"
