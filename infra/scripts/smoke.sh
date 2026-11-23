#!/usr/bin/env bash
# Smoke test pre-deploy: verifica endpoints críticos contra una API ya desplegada.
# Uso:
#   API_BASE=https://api.legalchile.cl/api/v1 ./infra/scripts/smoke.sh
#   API_BASE=http://localhost:3001/api/v1 X_COD_PLAN=DEMO ./infra/scripts/smoke.sh

set -euo pipefail

API_BASE="${API_BASE:?API_BASE requerido}"
X_COD_PLAN="${X_COD_PLAN:-DEMO}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local expected_status="$2"
  local url="$3"
  shift 3
  local actual
  actual=$(curl -s -o /tmp/smoke_body -w "%{http_code}" "$@" "$url")
  if [ "$actual" = "$expected_status" ]; then
    echo "  ✔ $name [$actual]"
    PASS=$((PASS + 1))
  else
    echo "  ✘ $name [esperado $expected_status, recibido $actual]"
    echo "    $(head -c 300 /tmp/smoke_body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "[smoke] target: $API_BASE"
echo ""
echo "Endpoints públicos:"
check "GET /health/live" 200 "$API_BASE/health/live"
check "GET /health (ok o degraded)" 200 "$API_BASE/health"
check "GET /metrics (Prometheus)" 200 "$API_BASE/metrics"
echo ""
echo "Endpoints tenant ($X_COD_PLAN):"
check "GET /me" 200 "$API_BASE/me" -H "X-Cod-Plan: $X_COD_PLAN"
check "GET /dashboard/kpis" 200 "$API_BASE/dashboard/kpis" -H "X-Cod-Plan: $X_COD_PLAN"
check "GET /afiliados" 200 "$API_BASE/afiliados" -H "X-Cod-Plan: $X_COD_PLAN"
check "GET /atenciones" 200 "$API_BASE/atenciones" -H "X-Cod-Plan: $X_COD_PLAN"
check "GET /gestiones" 200 "$API_BASE/gestiones" -H "X-Cod-Plan: $X_COD_PLAN"
echo ""
echo "Validación (debe responder 400 + español):"
check "POST /afiliados {} → 400" 400 "$API_BASE/afiliados" \
  -X POST -H "X-Cod-Plan: $X_COD_PLAN" -H "Content-Type: application/json" -d '{}'
grep -q "Validaci" /tmp/smoke_body && echo "    └ mensaje i18n correcto" || echo "    ⚠ esperaba mensaje en español"

echo ""
echo "Resultado: $PASS pass, $FAIL fail"
[ "$FAIL" -eq 0 ] || exit 1
