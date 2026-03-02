# OC-Master v4

**PDF設計準拠版** — OpenClaw + Ollama + OpenWebUI + Syncthing + rclone

```
設計思想: ローカルPC（16GB RAM）でプライバシー100%守りながら
          Ollama（月$0）をメインエンジンとして運用
```

## クイックスタート

```bash
# 1. セットアップ
bash scripts/init.sh

# 2. .env 編集（必須項目）
#    TELEGRAM_BOT_TOKEN=（BotFatherから取得）
#    TELEGRAM_ADMIN_IDS=（自分のUserID）
#    OC_ROOT=C:\Users\SY\dev\OC

# 3. Ollamaモデルを準備してから起動
docker compose up -d ollama
bash scripts/ollama_setup.sh

# 4. 全サービス起動
docker compose up -d --build

# 5. Syncthing設定
#    http://localhost:8384 → スマホとペアリング
#    staging フォルダを共有設定

# 6. Telegram で /start
```

## サービス一覧

| サービス | URL | 説明 |
|---|---|---|
| OC-Core | :8787 | Job API |
| **Ollama** | :11434 | **ローカルLLM（メイン）** |
| OpenWebUI | :3000 | AIチャット・モデル管理 |
| Syncthing | :8384 | ファイル同期管理 |

## Telegram コマンド

```
/add <内容>         Ollamaで処理（デフォルト・無料）
/add <内容> claude  Claude Sonnetで処理
/add <内容> runpod  RunPodで画像生成（Phase4〜）
/list               ジョブ一覧
/job <id>           詳細確認
/run <id>           実行承認（管理者）
/status             システム状態（管理者）
```

## 詳細ドキュメント

- [フェーズ計画](docs/PHASES.md)
- [セキュリティ設定](docs/SECURITY.md)
- [Claude Code CLI用](CLAUDE.md)
