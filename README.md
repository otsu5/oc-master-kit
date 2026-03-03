# OC-Master v5.1

**ローカルAIエージェント基盤** — Ollama + OC-Core + Telegram + Discord + Syncthing + rclone

```
設計思想: ローカルPC（16GB RAM）でプライバシー100%守りながら
          Ollama（月$0）をメインエンジンとして運用
          Telegram = 指揮官  |  Discord = 書庫
```

## アーキテクチャ

```
📱 Telegram（メイン指揮・ジョブ投入・承認・通知）
       ↓ Tailscale VPN
⚙️  OC-Core :8787（内部のみ・ホスト非公開）
  ├── Bearer Token認証
  ├── Core側admin判定（Interface信用しない）
  ├── BUDGET.yml 予算強制
  ├── プロンプトサニタイズ
  └── メモリ監視（OOM防止）
       ↓
🦙 Ollama :11434（メイン・月$0）
🤖 Claude API（重量タスクのみ・予算制限）
       ↓
📁 staging → 🔄 Syncthing → 📱 スマホ

💬 Discord（書庫モード・スレッドで結果整理・閲覧）
🖥️ OpenWebUI :3000（PCでモデル管理）
```

## クイックスタート

### Windows（推奨）
```powershell
.\scripts\init.ps1

# .env 編集 → Ollamaモデル準備 → 起動
docker compose up -d ollama
docker exec oc_ollama ollama pull qwen2.5-coder:7b
docker compose up -d --build
```

### Linux/WSL2
```bash
bash scripts/init.sh
docker compose up -d --build
```

## Interface設計

| Interface | 役割 | コマンド |
|---|---|---|
| **Telegram** | **メイン指揮** — ジョブ投入・承認・通知 | `/add`, `/run`, `/cancel`, `/status` |
| **Discord** | **書庫** — スレッドで結果整理・閲覧・検索 | `!oc list`, `!oc job`, `!oc archive` |
| **OpenWebUI** | PCモデル管理・チャット | http://localhost:3000 |

### なぜ2つ？
- **Telegram**: モバイルから素早く指示・承認。1対1のシンプルなやり取り
- **Discord**: スレッド形式で過去の結果を整理。「どの話題がどこにあるか」すぐ見つかる書庫

## セキュリティ（v5.1強化）

| 防御層 | 実装 |
|---|---|
| API認証 | CORE_API_TOKEN Bearer認証 |
| **Core側admin判定** | Interface側のisAdminを信用しない。Core自身がADMIN_IDSで検証 |
| **ポート非公開** | Core APIはDockerネットワーク内部のみ（ホストに公開しない） |
| **プロンプトサニタイズ** | 危険パターンブロック（インジェクション・システムコマンド・ファイルパス） |
| **メモリ監視** | 残0.5GB以下で新規ジョブ受付停止（OOMフリーズ防止） |
| 予算制御 | BUDGET.yml日次$5/月次$50をコードレベル強制 |
| ファイル境界 | staging限定書き込み、削除・上書き禁止 |
| 同期安全 | assetsはSyncthing対象外（削除伝播防止） |
| VPN | Tailscale経由のみ |

## 詳細ドキュメント

- [フェーズ計画](docs/PHASES.md)
- [セキュリティ設定](docs/SECURITY.md)
- [Claude Code CLI用](CLAUDE.md)
