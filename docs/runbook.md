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
| `DATABASE_URL` | postgres://localhost:5432 | En AWS se arma con `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_NAME` |
| `AUTH_DISABLED` | `true` (dev) | **NUNCA** `true` en prod |
| `STORAGE_BACKEND` | `local` (dev) / `s3` (prod) | |
| `S3_DOCUMENTS_BUCKET` | — | Requerido si backend=s3 |
| `SES_ENABLED` | `false` | `true` activa envío real |
| `WEBPAY_ENV` | `integration` | `production` para WebPay real |
| `ENTRA_TENANT_ID` | — | Referencia; la API no lo lee |
| `ENTRA_AUDIENCE` / `ENTRA_ISSUER` | — | Requeridos para aceptar tokens de Entra ID (sin ellos se rechazan) |
| `SESSION_JWT_SECRET` | — | Requerido en producción (≥ 32 caracteres) para el login con enlace |
| `OPENSEARCH_URL` | — | Opcional. Buscador de texto completo; sin él (o si no responde) se busca en Postgres |
| `OPENSEARCH_AWS_REGION` | — | Con dominio de AWS: firma las llamadas con el rol de la tarea (SigV4) |
| `OPENSEARCH_INDEX_PREFIX` | `nexus` | Prefijo de los índices (`<prefijo>-atenciones`, `<prefijo>-afiliados`) |
| `TRUSTED_PROXY_HOPS` | `1` | Proxies propios delante de la API (ALB, Render); define la IP real del cliente |

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

Primer despliegue de un ambiente (`dev`, `staging` o `prod`). El CI construye y prueba la imagen
(`Imagen Docker de la API`) pero **no** publica en ECR ni despliega: eso requiere credenciales de la cuenta AWS.

**1. Infraestructura.** La configuración del ambiente va como contexto de CDK; lo que falte aparece como
advertencia en la síntesis.

| Contexto | Variable en la API | Ejemplo |
|---|---|---|
| `webOrigin` | `WEB_ORIGIN` | `https://nexus.legalchile.cl` (obligatorio: enlaces de acceso y CORS) |
| `allowedEmailDomain` | `ALLOWED_EMAIL_DOMAIN` | `legalchile.cl` |
| `bootstrapAdminEmails` | `BOOTSTRAP_ADMIN_EMAILS` | correos del primer administrador |
| `entraTenantId` / `entraAudience` | `ENTRA_*` | registro de la aplicación en Entra ID |
| `sesEnabled` / `sesFrom` | `SES_ENABLED` / `SES_FROM` | `true` / remitente verificado en SES |
| `opensearch` | `OPENSEARCH_URL` / `OPENSEARCH_AWS_REGION` | `true` crea el dominio OpenSearch en la VPC (solo con mucho volumen; ver abajo) |
| `correoApruebaArancel`, `correoSolicitudFondos`, `correoAutorizaProvision`, `correoOperaciones` | `CORREO_*` | casillas del Anexo |

**Buscador (opcional).** Con `--context opensearch=true` el stack Data crea un dominio OpenSearch 2.17 en subredes
aisladas (HTTPS solo desde la VPC, cifrado en reposo con la llave de datos, acceso por IAM) y la API recibe la URL. Tras el
primer despliegue o un cambio de mapeo: Administración → Buscador → Reindexar todo. Si el dominio cae, las búsquedas siguen
en Postgres (aviso en el log "OpenSearch falló") y al volver se pone al día solo por la marca de cada índice.

`SESSION_JWT_SECRET` se genera en Secrets Manager y la base de datos llega como `DB_HOST`, `DB_PORT`,
`DB_USERNAME`, `DB_PASSWORD` y `DB_NAME` (la API arma la URL; ver `apps/api/src/db/url.ts`).

```bash
cd infra/cdk && pnpm build
export CDK_DEFAULT_ACCOUNT=<cuenta> CDK_DEFAULT_REGION=sa-east-1
npx cdk bootstrap                       # una vez por cuenta y región
npx cdk deploy --all -c stage=prod -c webOrigin=https://… -c entraTenantId=… -c entraAudience=… \
  -c sesEnabled=true -c sesFrom=no-reply@legalchile.cl -c correoOperaciones=operaciones@legalchile.cl
```

**Web y Entra ID.** Para ofrecer "Ingresar con Microsoft", registrar en el Entra ID de LegalChile una aplicación
SPA (redirect URI = origen de la web) y una API con un ámbito expuesto; en
`apps/web/src/environments/environment*.ts` poner `entra.clientId` (la SPA), `entra.authority`
(`https://login.microsoftonline.com/<tenant>`) y `entra.scopes` (`["api://<id-api>/<ámbito>"]`), y en la API
`entraTenantId` / `entraAudience` (= id de la API). Sin `clientId` la web solo ofrece el enlace por correo.

**2. Imagen de la API** (desde la raíz del repo; el repositorio ECR lo crea el stack Compute):

```bash
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
docker build -f apps/api/Dockerfile -t $ECR/legalmene-prod-api:latest .
docker push $ECR/legalmene-prod-api:latest
```

**3. Migraciones**, como tarea única de ECS con la misma definición de tarea (mismas variables y secretos),
antes de que el servicio tome la imagen nueva:

```bash
aws ecs run-task --cluster legalmene-prod --launch-type FARGATE --task-definition <api-task-def> \
  --network-configuration "awsvpcConfiguration={subnets=[<subnets privadas>],securityGroups=[<sg del servicio>]}" \
  --overrides '{"containerOverrides":[{"name":"web","command":["node","dist/apps/api/src/db/migrate.js"]}]}'
aws ecs update-service --cluster legalmene-prod --service <servicio> --force-new-deployment
```

Rolling deploy en ECS Fargate: circuit breaker con rollback automático si el healthcheck (`/api/v1/health`)
falla; mínimo 100 % y máximo 200 % para no degradar durante el deploy.

**Pendientes antes de producción:** SSL hacia Aurora (`DB_SSLMODE` + certificado de RDS en la imagen),
dominio verificado en SES, Route53/ACM para el dominio y un pipeline con rol OIDC de GitHub para publicar
la imagen y desplegar.

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

## Modo mantenimiento

Para freezes de despliegue o ventanas de migración:

```bash
# ECS: actualizar task definition con MAINTENANCE_MODE=true y desplegar
aws ecs update-service --cluster legalmene-prod --service api \
  --task-definition legalmene-api:NEW_REV

# Local
echo MAINTENANCE_MODE=true >> apps/api/.env
pnpm api:dev
```

Mientras está activo:
- `GET`, `HEAD`, `OPTIONS` pasan normalmente.
- `POST`, `PUT`, `PATCH`, `DELETE` devuelven `503` con `Retry-After`.
- `POST /pagos/confirmar` queda exento (callback Transbank no debe perderse).
- `Retry-After` configurable con `MAINTENANCE_RETRY_AFTER` (segundos, default 300).

Recuperar: quitar el env var y redeploy.

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
