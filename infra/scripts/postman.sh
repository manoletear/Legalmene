#!/usr/bin/env bash
# Genera collection Postman a partir de OpenAPI de Swagger.
# Uso:
#   API_BASE=http://localhost:3001 ./infra/scripts/postman.sh
#
# Genera ./infra/postman/legalmene.postman_collection.json
# Importar en Postman → Run Collection con variable env "codPlan=DEMO".

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3001}"
OUT_DIR="infra/postman"
SPEC="$OUT_DIR/openapi.json"
COLLECTION="$OUT_DIR/legalmene.postman_collection.json"

mkdir -p "$OUT_DIR"
echo "[postman] descargando OpenAPI desde $API_BASE/api/docs-json"
curl -sf "$API_BASE/api/docs-json" > "$SPEC"

echo "[postman] convirtiendo OpenAPI → Postman v2.1"
npx -y openapi-to-postmanv2 -s "$SPEC" -o "$COLLECTION" -p \
  -O folderStrategy=Tags,requestParametersResolution=Example,exampleParametersResolution=Example \
  > /dev/null

echo "[postman] OK → $COLLECTION"
echo "[postman] componentes: $(jq '.item | length' "$COLLECTION") tags"
