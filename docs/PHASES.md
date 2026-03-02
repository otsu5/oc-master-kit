# OC-Master v5 — フェーズ計画

OC-Core自作基盤 + Ollama + Telegram によるAIエージェントシステム。

## 全体アーキテクチャ

```
📱 Telegram Bot（モバイル全指揮）
       ↓ Tailscale VPN
⚙️  OC-Core :8787（Job Queue / Approval / Audit / Budget）
       ↓ CORE_API_TOKEN認証
🦙 Ollama :11434（ローカルLLM・デフォルト・月$0）
       ↓ 重量タスクのみ
🤖 Claude API（設計・実装・BUDGET.ymlで日次/月次制限）
       ↓
📁 staging → 🔄 Syncthing → 📱 スマホ
                     ↓ rcloneバックアップ
              ☁️ MEGA（削除リスク対策）

PC監視: OpenWebUI :3000 / Syncthing :8384
```

---

## Phase 1 — 基盤（現在）

**目標**: Ollama + Telegram + OC-Core の3点セット動作確認

| コンポーネント | 状態 | 説明 |
|---|---|---|
| Docker Compose | ✅ | マルチステージビルド対応 |
| OC-Core API | ✅ | Job Queue / Approval / Runner / Auth / Budget |
| Telegram Bot | ✅ | 承認ボタン付き・モバイル指揮 |
| Ollama（ローカルLLM） | ✅ | メインエンジン・月$0 |
| OpenWebUI | ✅ | PCでモデル管理・チャット |
| Syncthing | ✅ | 生成物→スマホ自動配送（assets除外） |
| rclone バックアップ | ✅ | 削除リスク対策 |
| API認証 | ✅ | CORE_API_TOKEN Bearer認証 |
| 予算制御 | ✅ | BUDGET.yml読み込み・日次/月次制限 |
| 入力検証 | ✅ | Zodスキーマバリデーション |
| 起動時復旧 | ✅ | RUNNING放置ジョブをERROR復旧 |

---

## Phase 2 — Task Planner

**目標**: Ollamaがタスクを自律分解・サブジョブに振り分け

| 追加コンポーネント | 説明 |
|---|---|
| Task Planner | qwen2.5-coder:7b がジョブを分解 |
| Multi-model routing | 軽量→phi4-mini / 複雑→qwen2.5-coder |
| Miyabi Runtime統合 | GitHub Issue → PR → Merge |

---

## Phase 3 — Codex PRレビュー

**目標**: GitHub PRの自動品質チェック

---

## Phase 4 — RunPod ComfyUI（画像/動画生成）

**目標**: Telegram指示 → RunPod生成 → Syncthing → スマホ自動配送

```
Telegram: /add 富士山の画像 runpod
    ↓
OC-Core（RunPod Adapter）
    ↓
RunPod ComfyUI API → /oc/staging/generated/
    ↓ Syncthing → 📱 スマホ
    ↓ rclone  → ☁️ MEGA
```

---

## Phase 5 — MiyabiDash iOS / TUI

---

## コスト設計

| 項目 | 月額 |
|---|---|
| Ollama（軽量タスク） | **$0** |
| Claude API（重量タスク） | $5上限（BUDGET.yml強制） |
| RunPod（Phase4〜） | $10〜20 |
| Syncthing / rclone / Tailscale | **$0** |
| **合計** | **$5〜25/月** |
