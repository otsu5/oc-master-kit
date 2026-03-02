# セキュリティ設計ガイド — OC-Master v5

設計の4層構成に基づく。

## レイヤー構成

```
Layer 1: Core API認証         — CORE_API_TOKEN による Bearer認証
Layer 2: Tailscale VPN        — ネットワーク隔離（外部公開ゼロ）
Layer 3: Syncthing            — P2P暗号化同期（クラウド経由なし）
Layer 4: rclone + MEGA        — バックアップ（削除リスク対策）
```

## 1. Core API 認証（v5で追加）

OC-Core API はトークン認証で保護される。

### 設定
```bash
# .env にトークンを設定（32文字以上推奨）
CORE_API_TOKEN=$(openssl rand -hex 32)
```

### 動作
- `/health` エンドポイントのみ認証不要（Docker healthcheck用）
- その他すべてのエンドポイントは `Authorization: Bearer <token>` が必須
- Telegram Bot は `CORE_API_TOKEN` を使ってCore APIにアクセス
- トークン未設定時は開発モード（警告表示、認証なしで通過）

### docker-compose での保護
```yaml
ports:
  - "127.0.0.1:8787:8787"   # localhostのみ公開
```

## 2. Tailscale（VPN・必須）

### インストール
```bash
# PC（WSL2内）
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# スマホ: App Store / Google Play → 同じアカウントでログイン
```

### 確認
```bash
tailscale status
```

### アクセス制限（ACL）
Tailscale管理画面 → Access Controls:
```json
{
  "acls": [
    { "action": "accept", "src": ["autogroup:member"], "dst": ["autogroup:self:*"] }
  ]
}
```

## 3. Syncthing（ファイル同期）

### ⚠️ 重要な注意
**Syncthingは「同期」であり「バックアップ」ではない。**
片方のデバイスでファイルを削除すると、全デバイスで削除される。
→ **必ずrcloneバックアップと併用すること**

### 同期対象（v5で修正）
```
PC側フォルダ        → スマホ側フォルダ
/oc/staging        → スマホ/OC/staging    （生成物自動配送）
/oc/ObsidianVault  → スマホ/OC/vault      （Vault同期）
```

### ⛔ 同期対象外
- `/oc/assets` — **削除禁止ポリシーと矛盾するため、Syncthing対象外**
- assetsのバックアップは rclone で行う

### バージョン管理
フォルダ設定 → バージョニング → 「ごみ箱」 → 保管期間: 30日

## 4. rclone + MEGA（バックアップ・削除対策）

### インストール
```bash
curl https://rclone.org/install.sh | sudo bash
rclone config
# → n → name: mega → Storage: mega → メール・パスワード
```

### バックアップ実行
```bash
# 手動
bash scripts/backup.sh

# 自動（cron・毎日午前3時）
crontab -e
# 追記: 0 3 * * * bash /path/to/oc-master-kit/scripts/backup.sh
```

## 5. コスト制御（v5で追加）

### BUDGET.yml の強制
- OC-Core が起動時に `BUDGET.yml` を読み込む
- Claude / OpenAI API 呼び出し前に日次・月次予算をチェック
- 予算超過時はジョブ実行を拒否（HTTP 429）
- Telegram に予算警告を通知

### コスト記録
- すべてのAPI呼び出しのコストが `cost_log` テーブルに記録
- `/status` コマンドで現在のコスト消化状況を確認可能

## 6. セキュリティ原則一覧

| 原則 | 実装 |
|---|---|
| AI削除禁止 | `flag: 'wx'`（上書き禁止） |
| 書き込みはstagingのみ | パストラバーサルチェック + ジョブID正規化 |
| 外部公開禁止 | Tailscale VPN + `127.0.0.1` バインド |
| API認証必須 | CORE_API_TOKEN による Bearer認証 |
| 承認制 | TELEGRAM_ADMIN_IDSのみ実行可 |
| データローカル完結 | Ollamaでクラウド不使用 |
| バックアップ二重化 | Syncthing + rclone |
| コスト制御 | BUDGET.yml による日次/月次制限 |
| 入力検証 | Zodスキーマによるリクエストバリデーション |
| assets同期禁止 | Syncthing対象外（削除伝播リスク排除） |
