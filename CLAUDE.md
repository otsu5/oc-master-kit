# OC-Master v4 — Claude Code CLI 指示書

## プロジェクト概要

**PDF設計思想（最優先）**:
- ローカルPC（第6世代CPU、16GB RAM）でプライバシー100%守る
- **Ollama がメインエンジン（月$0）** — Claude APIは重量タスクのみ
- 画像/動画生成はRunPod委託（Phase4〜）
- Syncthing で生成物をスマホに自動配送
- rclone でバックアップ（Syncthing削除リスク対策）

## 絶対ルール（変更禁止）

1. **AI の書き込みは `/oc/staging` のみ**
2. **削除・移動・上書き禁止**（`flag: 'wx'` を維持）
3. **デフォルト agentType は `ollama`**（Claude APIは明示指定時のみ）
4. **外部公開禁止**（Tailscale VPN経由のみ）
5. **Syncthing設定時は必ずrcloneバックアップも確認**

## アーキテクチャ

```
Telegram Bot（モバイル）
    ↓ Tailscale VPN
OC-Core :8787（Job Queue / Approval）
    ↓
[Ollama :11434] ← デフォルト（月$0）
[Claude API]    ← 重量タスクのみ
[RunPod]        ← 画像生成（Phase4〜）
    ↓
/oc/staging → Syncthing → スマホ
                 ↓ rclone
              MEGA バックアップ

PC監視: OpenWebUI :3000 / Syncthing :8384
```

## Ollamaモデル設定

```bash
# メイン（日本語・ツール安定）
docker exec oc_ollama ollama pull qwen2.5-coder:7b

# 軽量高速タスク
docker exec oc_ollama ollama pull phi4-mini
```

設定（BUDGET.yml）:
- heartbeat: OFF（コスト暴走防止）
- max_concurrent: 3（暴走防止）
- temperature: 0.2
- context: 40000 tokens

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

# ログ確認
docker compose logs -f core
docker compose logs -f telegram
docker compose logs -f ollama
```

## フェーズ状況

- Phase 1: ✅ Ollama + Telegram + Core + Syncthing + rclone
- Phase 2: 🔜 Task Planner（Ollama multi-model routing）
- Phase 3: 🔜 Codex PRレビュー
- Phase 4: 🔜 RunPod ComfyUI（RUNPOD_COMFYUI_URL設定後）
- Phase 5: 🔜 MiyabiDash iOS / OpenClaw TUI
