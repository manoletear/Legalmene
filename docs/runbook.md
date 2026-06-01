# Runbook — Legalmene (LegalChile PSL)

Procedimientos operacionales para dev y prod. Para arquitectura, ver
[`propuesta-arquitectura-legalchile.md`](./propuesta-arquitectura-legalchile.md).

## Stack local

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # o pg_ctlcluster
cp apps/api/.env.example apps/api/.env

pnpm db:migrate
pnpm db:seed
pnpm api:dev    # :3001 (Swagger /api/docs)
pnpm web:dev    # :4200
pnpm db:studio  # Drizzle Studio UI sobre el schema
```

## Variables de entorno críticas

| Variable | Default | Notas |
|---|---|---|
| `DATABASE_URL` | postgres://localhost:5432 | Aurora en prod |
| `AUTH_DISABLED` | `true` (dev) | **NUNCA** `true` en prod |
| `STORAGE_BACKEND` | `local` (dev) / `s3` (prod) | |
| `S3_DOCUMENTS_BUCKET` | — | Requerido si backend=s3 |
| `SES_ENABLED` | `false` | `true` activa envío real |
| `WEBPAY_ENV` | `integration` | `production` para WebPay real |
| `ENTRA_TENANT_ID` | — | Requerido si AUTH_DISABLED=false |

## Migraciones

```bash
# Cambio de schema → genera migration SQL
pnpm db:generate

# Aplicar (dev y prod)
pnpm db:migrate

# Revisar histórico
PGPASSWORD=... psql -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;"
```

**Política de rollback**: nunca borrar migraciones aplicadas en prod. Si un
cambio rompe, generar una migración correctora (`0XXX_revert_*.sql`).

## Backup + restore

```bash
# Dump local + opcional S3
DATABASE_URL=... ./infra/scripts/backup.sh

# Restore desde dump
gunzip -c legalmene-20260101T060000Z.sql.gz | psql $DATABASE_URL
```

Producción: GitHub Action `backup-nightly.yml` 06:00 UTC, retiene 30 días en
S3 STANDARD_IA. Pruebas de restore mensuales obligatorias.

## Observabilidad

- Health: `GET /api/v1/health` (200 ok, 503 degraded).
- Metrics: `GET /api/v1/metrics` (Prometheus text). Importar
  `infra/grafana/legalmene-dashboard.json`.
- Logs: pino → stdout → CloudWatch (ECS).
- Tracing: AWS X-Ray sidecar (pendiente integrar).

### Alarmas mínimas (CloudWatch)

| Alarma | Condición |
|---|---|
| `LegalmeneAuroraCPU` | CPU Aurora > 80% por 10 min |
| `Legalmene5xxRate` | `legalmene_http_requests_total{status=~"5.."}` > 5% por 5 min |
| `LegalmeneP95Latency` | p95 > 1000ms por 10 min |
| `LegalmeneEventLoopLag` | > 100ms por 5 min |
| `LegalmeneDeadLetterSqs` | > 0 mensajes en DLQ |

## Despliegue

```bash
# Push imagen API a ECR (CI lo hace automático en main)
aws ecr get-login-password | docker login ...
docker build -t legalmene-api apps/api
docker tag legalmene-api $ECR/legalmene-api:latest
docker push $ECR/legalmene-api:latest

# CDK
cd infra/cdk
pnpm build
npx cdk deploy --all --context stage=prod
```

Rolling deploy ECS Fargate: circuit breaker activado, rollback automático
en healthcheck fallido. Min 100% / max 200% para no degradar durante el
deploy.

## Incidentes comunes

### 1. API responde 503 con `db: error`

```bash
# Diagnóstico
curl /api/v1/health
PGPASSWORD=... psql -c "SELECT 1;"

# Causas: Aurora paused, security group, secret rotación.
# Mitigación: reiniciar tasks ECS para refrescar pool, validar secret en SM.
```

### 2. Correlativos duplicados (no debería ocurrir post migration 0002)

```sql
-- Detectar
SELECT cod_plan, correlativo, count(*)
FROM atenciones GROUP BY 1,2 HAVING count(*) > 1;

-- Si pasa: bug en siguienteCorrelativo() — abrir incidente P1.
```

### 3. Cargas masivas STOCK eliminó padrón por error

```sql
-- Rollback: marcar Activo todos los eliminados en ventana.
UPDATE afiliados
   SET vigencia = 'Activo', fecha_egreso = NULL
 WHERE cod_plan = 'EMPxx' AND vigencia = 'Eliminado'
   AND fecha_egreso > NOW() - INTERVAL '1 hour';
```

### 4. WebPay callback no llega

- Verificar URL de retorno en Transbank console.
- Logs CloudWatch: filter `pagos/confirmar`.
- Si transacción quedó en `Iniciado`: consultar manualmente con SDK
  Transbank y actualizar via `POST /pagos/confirmar`.

## Procedimientos de seguridad

- Rotación secrets Aurora: AWS SM rotation lambda cada 90 días.
- Token Transbank: rotar manualmente cada cambio de ambiente.
- Acceso a logs CloudWatch: rol `LegalmeneAuditor` (read-only).
- Acceso a producción DB: solo via session manager con MFA.

## Contactos

| Rol | Persona | On-call |
|---|---|---|
| Tech lead | TBD | 24/7 |
| DBA | TBD | semana |
| Cumplimiento | TBD | hábil |
