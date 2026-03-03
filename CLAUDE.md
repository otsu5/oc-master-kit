# OC-Master v5.2 — Claude Code CLI 指示書

## 絶対ルール（変更禁止）

1. AI の書き込みは `/oc/staging` のみ（削除・移動・上書き禁止、flag: 'wx'）
2. デフォルト agentType は `glm-flash`（GLM-4.7-Flash・完全無料）
3. Core APIはDockerネットワーク内部のみ（ポート非公開）
4. run/cancelのadmin判定はCore側で強制（Interface層を信用しない）
5. Syncthing にassetsをマウントしない（削除伝播リスク）

## 4層ルーティング

```
Tier 0: glm-flash    GLM-4.7-Flash   $0          日常タスク（デフォルト）
Tier 1: ollama       phi-4-mini      $0          オフライン
Tier 2: groq         Llama 3.3 70B   $0.59-0.79  高速・中量級
Tier 3: glm-5        GLM-5           $1.00-3.20  自律Agent・設計
Special: miyabi      Miyabi MCP      varies      整流オーケストレーション
```

## コード構成

```
oc-master-kit/
├── core/src/
│   ├── index.ts, db.ts, adapters.ts（GLM/Groq/Ollama/Miyabi）
│   ├── auth.ts（認証+Core側admin）, budget.ts, validate.ts
│   ├── sanitize.ts, memory.ts, runner.service.ts
├── interfaces/telegram/（メイン指揮）
├── interfaces/discord/（書庫・スレッド整理）
├── miyabi.config.json（MCP Bridge設定）
├── BUDGET.yml, docker-compose.yml
└── scripts/init.ps1, init.sh
```

## Telegramコマンド

```
/add <内容>              → glm-flash（無料）
/add <内容> groq         → Groq爆速
/add <内容> glm-5        → GLM-5重量級
/add <内容> ollama       → ローカル
/add <内容> miyabi       → Miyabi自律実行
/run <id>  /cancel <id>  → 管理者のみ
/status  /list  /help
```
