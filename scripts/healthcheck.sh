#!/usr/bin/env bash
# OC-Master v4 ヘルスチェック
echo "═══════════════════════════════════"
echo " OC-Master v4 Health Check"
echo "═══════════════════════════════════"

echo ""
echo "📦 Containers:"
docker ps --filter "name=oc_" --format "  {{.Names}}\t{{.Status}}"

echo ""
echo "🦙 Ollama:"
OLLAMA=$(curl -sf http://localhost:11434/api/tags 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); [print('  ✅',m['name']) for m in d.get('models',[])]" 2>/dev/null || echo "  ❌ 接続失敗")
echo "$OLLAMA"

echo ""
echo "⚙️  OC-Core:"
CORE=$(curl -sf http://localhost:8787/health 2>/dev/null || echo "UNREACHABLE")
echo "  $CORE"

echo ""
echo "📊 Job Status:"
STATUS=$(curl -sf http://localhost:8787/status 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k,v in d.get('jobs',{}).items(): print(f'  {k}: {v}')
print(f'  Staging: {d[\"staging\"][\"count\"]}件')
" 2>/dev/null || echo "  UNREACHABLE")
echo "$STATUS"

echo ""
echo "🔄 Syncthing:"
SYNC=$(curl -sf http://localhost:8384/rest/system/ping \
  -H "X-API-Key: $(grep -oP '(?<=<apikey>)[^<]+' ~/.local/share/syncthing/config.xml 2>/dev/null || echo '')" \
  2>/dev/null || echo "管理画面: http://localhost:8384")
echo "  $SYNC"

echo ""
echo "═══════════════════════════════════"
