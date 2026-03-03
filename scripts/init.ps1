# ═══════════════════════════════════════════════════════════
#  OC-Master v5.1 — Windows セットアップスクリプト
#  PowerShell 5.1+ 対応（WSL2不要）
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  OC-Master v5.1 Setup (Windows)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

# ── 1. Docker Desktop チェック ────────────────────────────
Write-Host "`n[1/6] Docker Desktop チェック..." -ForegroundColor Yellow
try {
    $dockerVer = docker --version 2>&1
    Write-Host "  OK: $dockerVer" -ForegroundColor Green
} catch {
    Write-Host "  NG: Docker Desktop がインストールされていません" -ForegroundColor Red
    Write-Host "  → https://www.docker.com/products/docker-desktop/ からインストール" -ForegroundColor Red
    exit 1
}

# ── 2. OC_ROOT ディレクトリ作成 ───────────────────────────
$OC_ROOT = "C:\Users\$env:USERNAME\dev\OC"
Write-Host "`n[2/6] ディレクトリ作成: $OC_ROOT" -ForegroundColor Yellow

$dirs = @(
    "$OC_ROOT\inbox_raw",
    "$OC_ROOT\staging",
    "$OC_ROOT\assets",
    "$OC_ROOT\processed",
    "$OC_ROOT\ObsidianVault",
    "$OC_ROOT\agent\queue",
    "$OC_ROOT\agent\logs",
    "$OC_ROOT\agent\backups"
)

foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  Created: $d" -ForegroundColor Gray
    }
}
Write-Host "  OK: 全ディレクトリ作成完了" -ForegroundColor Green

# ── 3. .env 作成 ──────────────────────────────────────────
Write-Host "`n[3/6] .env ファイル作成..." -ForegroundColor Yellow
$envFile = Join-Path $PSScriptRoot "..\.env"
$envExample = Join-Path $PSScriptRoot "..\.env.example"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        # OC_ROOT を自動設定
        (Get-Content $envFile) -replace 'OC_ROOT=.*', "OC_ROOT=$OC_ROOT" | Set-Content $envFile
        Write-Host "  Created: .env (from .env.example)" -ForegroundColor Green
        Write-Host "  ⚠️  .env を編集して以下を設定してください:" -ForegroundColor Yellow
        Write-Host "     TELEGRAM_BOT_TOKEN" -ForegroundColor Yellow
        Write-Host "     TELEGRAM_ADMIN_IDS" -ForegroundColor Yellow
        Write-Host "     CORE_API_TOKEN (下で自動生成可)" -ForegroundColor Yellow
    } else {
        Write-Host "  NG: .env.example が見つかりません" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  OK: .env 既存" -ForegroundColor Green
}

# ── 4. CORE_API_TOKEN 自動生成 ────────────────────────────
Write-Host "`n[4/6] CORE_API_TOKEN チェック..." -ForegroundColor Yellow
$envContent = Get-Content $envFile -Raw
if ($envContent -match "CORE_API_TOKEN=replace_") {
    $token = -join ((48..57) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    (Get-Content $envFile) -replace 'CORE_API_TOKEN=.*', "CORE_API_TOKEN=$token" | Set-Content $envFile
    Write-Host "  Generated: CORE_API_TOKEN (64 chars)" -ForegroundColor Green
} else {
    Write-Host "  OK: CORE_API_TOKEN 設定済み" -ForegroundColor Green
}

# ── 5. .gitignore チェック ────────────────────────────────
Write-Host "`n[5/6] .gitignore チェック..." -ForegroundColor Yellow
$gitignore = Join-Path $PSScriptRoot "..\.gitignore"
if (Test-Path $gitignore) {
    Write-Host "  OK: .gitignore 存在" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  .gitignore がありません" -ForegroundColor Yellow
}

# ── 6. 次のステップ表示 ──────────────────────────────────
Write-Host "`n═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  セットアップ完了！" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor White
Write-Host "  1. .env を編集（TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_IDS）" -ForegroundColor White
Write-Host "  2. docker compose up -d ollama" -ForegroundColor White
Write-Host "  3. docker exec oc_ollama ollama pull qwen2.5-coder:7b" -ForegroundColor White
Write-Host "  4. docker compose up -d --build" -ForegroundColor White
Write-Host "  5. Telegram で /start" -ForegroundColor White
Write-Host ""
Write-Host "Discord（書庫モード）を使う場合:" -ForegroundColor Gray
Write-Host "  .env に DISCORD_BOT_TOKEN を設定" -ForegroundColor Gray
Write-Host "  Discord で !oc help" -ForegroundColor Gray
