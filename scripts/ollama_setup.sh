#!/usr/bin/env bash
# ════════════════════════════════════════════════
#  Ollama セットアップ — モデルダウンロード
#  PDFのモデル優先順位:
#  1位: qwen2.5-coder:7b   日本語・ツール安定・16GBで動く
#  2位: phi4-mini           爆速・軽量タスク向き
#  3位: gemma3:9b           新顔・期待値高い
# ════════════════════════════════════════════════
set -euo pipefail

CONTAINER="oc_ollama"

echo "🦙 Ollama モデルセットアップ"
echo ""

# コンテナ起動確認
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "❌ ${CONTAINER} が起動していません"
  echo "   docker compose up -d ollama"
  exit 1
fi

echo "📥 qwen2.5-coder:7b（メイン推論・日本語対応）"
docker exec "$CONTAINER" ollama pull qwen2.5-coder:7b

echo ""
echo "📥 phi4-mini（軽量・高速タスク用）"
docker exec "$CONTAINER" ollama pull phi4-mini

echo ""
echo "✅ インストール済みモデル:"
docker exec "$CONTAINER" ollama list

echo ""
echo "🔧 設定確認:"
echo "  heartbeat: OFF（コスト暴走防止）"
echo "  max_concurrent: 3（暴走防止）"
echo "  context: 40000 tokens"
echo ""
echo "📝 モデルテスト:"
echo "  docker exec $CONTAINER ollama run qwen2.5-coder:7b '日本語で挨拶して'"
