# OC-Master v4 — フェーズ計画

PDFの設計思想 + OC-Master v3 を統合した完全版。

## 全体アーキテクチャ（PDF準拠）

```
📱 Telegram Bot（モバイル全指揮）
       ↓ Tailscale VPN
⚙️  OC-Core（Job Queue / Approval / Audit）
       ↓
🦙 Ollama（ローカルLLM・デフォルト・月$0）
       ↓ 重量タスクのみ
🤖 Claude API（設計・実装・BUDGET.yml管理）
       ↓
📁 staging → 🔄 Syncthing → 📱 スマホ
                     ↓ rcloneバックアップ
              ☁️ MEGA（削除リスク対策）
```

---

## Phase 1 — 基盤（現在・即実装可能）

**目標**: Ollama + Telegram + OC-Core の3点セット動作確認

| コンポーネント | 状態 | 説明 |
|---|---|---|
| Docker Compose | ✅ | Ollama + Core + Telegram + OpenWebUI + Syncthing |
| OC-Core API | ✅ | Job Queue / Approval / Runner |
| Telegram Bot | ✅ | 承認ボタン付き・モバイル指揮 |
| **Ollama（ローカルLLM）** | ✅ | **PDF設計の核心・月$0** |
| OpenWebUI | ✅ | PCでモデル管理・チャット |
| Syncthing | ✅ | 生成物→スマホ自動配送 |
| rclone バックアップ | ✅ | 削除リスク対策（必須） |
| Tailscale VPN | 📖 ドキュメント | docs/SECURITY.md |

**使用モデル**:
```bash
# メイン（推奨）
docker exec oc_ollama ollama pull qwen2.5-coder:7b

# 軽量・高速
docker exec oc_ollama ollama pull phi4-mini
```

**起動コマンド**:
```bash
bash scripts/init.sh
docker compose up -d --build
bash scripts/ollama_setup.sh
```

---

## Phase 2 — Task Planner（Ollamaオーケストレーター）

**目標**: Ollamaがタスクを自律分解・サブジョブに振り分け

| 追加コンポーネント | 説明 |
|---|---|
| Task Planner | qwen2.5-coder:7b がジョブを分解 |
| Multi-model routing | 軽量→phi4-mini / 複雑→qwen2.5-coder |
| Miyabi Runtime統合 | GitHub Issue → PR → Merge |

**Ollamaルーティング設定**（BUDGET.yml）:
```yaml
routing:
  simple_queries: phi4-mini
  complex: qwen2.5-coder:7b
  max_concurrent: 3          # 暴走防止
  heartbeat:
    enabled: false           # コスト暴走防止（PDFで明記）
```

---

## Phase 3 — Codex PRレビュー

**目標**: GitHub PRの自動品質チェック

| 追加コンポーネント | 説明 |
|---|---|
| OpenAI Adapter | GPT-4o でPRレビュー |
| GitHub Actions連携 | PR作成時に自動トリガー |

---

## Phase 4 — RunPod ComfyUI（画像/動画生成）

**目標**: Telegram指示 → RunPod生成 → Syncthing → スマホ自動配送

**PDFのデータフロー**:
```
Telegram: /add 富士山の画像 runpod
    ↓
OC-Core（RunPod Adapter）
    ↓
RunPod ComfyUI API（RTX 4090・1時間約45円）
    ↓ Webhook / ポーリング
生成物ダウンロード → /oc/staging/generated/
    ↓ Syncthing（自動）
📱 スマホ（秘密フォルダ）
    ↓ rclone（夜間自動）
☁️ MEGA バックアップ
```

**セットアップ**:
```bash
# RunPodでComfyUIポッド起動
# → RUNPOD_COMFYUI_URL を .env に設定
# → docker compose restart telegram core
```

**コスト目安（PDF記載）**:
- RTX 4090: 1時間約$0.34（約45円）
- 1日1時間 → 月約1,350円
- 使わない時間は自動停止設定で0円

---

## Phase 5 — MiyabiDash iOS / OpenClaw TUI

**目標**: ネイティブモバイルUI + tmux 4ペイン並列監視

**tmux 4ペイン構成**:
```
┌─────────────────┬─────────────────┐
│ Task Planner    │ Remote CC       │
│ (Ollama/Opus)   │ (Claude Sonnet) │
├─────────────────┼─────────────────┤
│ Logs Monitor    │ Syncthing状態   │
│ docker logs -f  │ 同期ファイル確認 │
└─────────────────┴─────────────────┘
```

---

## コスト設計（PDF準拠）

| 項目 | 月額 |
|---|---|
| Ollama（軽量タスク） | **$0**（ローカル） |
| Claude API（重量タスク） | $5上限（BUDGET.yml） |
| RunPod（Phase4〜・使用時のみ） | $10〜20 |
| Syncthing | **$0** |
| rclone + MEGA | **$0**（20GB無料） |
| Tailscale | **$0**（20デバイス無料） |
| **合計** | **$5〜25/月** |

---

## 失敗パターンと対策（PDFより）

| 失敗 | 原因 | 対策 |
|---|---|---|
| ツール呼び出しループ | JSON崩壊・コンテキスト汚染 | `max_concurrent: 3`、temperature 0.2 |
| 日本語出力が英語混じり | モデルが英語寄り | qwen2.5-coder:7bを優先 |
| Syncthing同期で全消え | 片方削除が全デバイスに伝播 | rcloneバックアップ必須 |
| Ollamaメモリ不足 | 7Bモデルが重すぎ | phi4-mini（3.8B）に切替 |
| heartbeat爆発 | コスト暴走 | `heartbeat.enabled: false` |
| RunPod生成物が消える | ポッドのContainer Diskは揮発 | Network Volume使用 |
