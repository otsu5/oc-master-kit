#!/usr/bin/env bash
# ════════════════════════════════════════════════
#  rclone バックアップ — Syncthing削除リスク対策
#
#  PDFで明記: 「Syncthingは同期 ≠ バックアップ。
#  片方で消したら両方消える。rcloneで別ストレージへ必須」
#
#  使い方:
#    bash scripts/backup.sh
#    cron: 0 3 * * * bash /path/to/scripts/backup.sh
# ════════════════════════════════════════════════
set -euo pipefail
source .env

if [[ "$OC_ROOT" =~ ^[Cc]:\\ ]]; then
  OC_PATH=$(echo "$OC_ROOT" | sed 's|\\|/|g' | sed 's|^\([Cc]\):|/mnt/\L\1|')
else
  OC_PATH="$OC_ROOT"
fi

TS=$(date +"%Y%m%d_%H%M%S")
REMOTE="${RCLONE_REMOTE:-mega}"
DEST="${RCLONE_DEST:-mega:oc-backup}"

echo "[$TS] 🗄️  rcloneバックアップ開始"
echo "  送信元: $OC_PATH"
echo "  送信先: $DEST"

# staging（AI生成物）をバックアップ
rclone copy "$OC_PATH/staging" "$DEST/staging-$TS" \
  --progress \
  --transfers 4 \
  --log-level INFO \
  --log-file "$OC_PATH/agent/logs/rclone-$TS.log"

# ObsidianVault をバックアップ
rclone copy "$OC_PATH/ObsidianVault" "$DEST/vault-$TS" \
  --progress \
  --transfers 4

echo "[$TS] ✅ バックアップ完了"
echo "  ⚠️  Syncthingで削除してもrcloneコピーは残ります"

# 古いバックアップを30日で自動削除
rclone delete "$DEST" \
  --min-age 30d \
  --log-level INFO 2>/dev/null || true

echo "[$TS] 🧹 30日以上前のバックアップを削除"
