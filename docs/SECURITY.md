# セキュリティ設定ガイド

PDF設計に基づくセキュリティ3層構成。

## レイヤー構成

```
Layer 1: Tailscale VPN     — ネットワーク隔離（外部公開ゼロ）
Layer 2: Syncthing         — P2P暗号化同期（クラウド経由なし）
Layer 3: rclone + MEGA     — バックアップ（削除リスク対策）
```

## 1. Tailscale（VPN・必須）

### インストール
```bash
# PC（WSL2内）
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# スマホ
# App Store / Google Play → Tailscale → 同じアカウントでログイン
```

### 確認
```bash
tailscale status
# → PCとスマホが同じネットワークに表示されればOK
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

## 2. Syncthing（ファイル同期）

### ⚠️ 重要な注意
**Syncthingは「同期」であり「バックアップ」ではない。**
片方のデバイスでファイルを削除すると、全デバイスで削除される。
→ **必ずrcloneバックアップと併用すること**（PDFで明記）

### セットアップ
1. http://localhost:8384 にアクセス
2. 初回パスワードを設定（必須）
3. スマホのSyncthingでデバイスIDを確認
4. PC側で「デバイスを追加」→ スマホのIDを入力
5. 共有フォルダの設定:

```
PC側フォルダ        → スマホ側フォルダ
/oc/staging        → スマホ/OC/staging    （生成物自動配送）
/oc/ObsidianVault  → スマホ/OC/vault      （Vault同期）
```

### バージョン管理（削除ファイルの一時保管）
フォルダ設定 → バージョニング → 「ごみ箱」 → 保管期間: 30日

## 3. rclone + MEGA（バックアップ・削除対策）

### インストール
```bash
# WSL2内
curl https://rclone.org/install.sh | sudo bash

# MEGAアカウント設定
rclone config
# → n（新規）→ name: mega → Storage: mega → メールアドレス・パスワード入力
```

### バックアップ実行
```bash
# 手動
bash scripts/backup.sh

# 自動（cron・毎日午前3時）
crontab -e
# 追記: 0 3 * * * bash /path/to/oc-master-v4/scripts/backup.sh
```

## 4. APIキー管理

```bash
# .env はGitにコミットしない
echo ".env" >> .gitignore

# 権限を制限
chmod 600 .env
```

## 5. セキュリティ原則

| 原則 | 実装 |
|---|---|
| AI削除禁止 | `flag: 'wx'`（上書き禁止） |
| 書き込みはstagingのみ | パストラバーサルチェック |
| 外部公開禁止 | Tailscale VPN必須 |
| 承認制 | TELEGRAM_ADMIN_IDSのみ実行可 |
| データローカル完結 | Ollamaでクラウド不使用 |
| バックアップ二重化 | Syncthing + rclone |
