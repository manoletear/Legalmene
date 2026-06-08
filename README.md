# Legalmene — LegalChile PSL

Sistema de gestión legal SaaS multi-tenant para LegalChile. Reemplaza el
sistema legado en SQL Server 2008 / Windows Server por una plataforma
cloud-native en AWS.

[![CI](https://github.com/manoletear/Legalmene/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)

## Estado

| Componente | Estado |
|---|---|
| Backend NestJS (Atenciones / Afiliados / Gestiones / Comités / Pagos) | ✅ |
| Frontend Angular 19 (9 vistas branded LegalChile) | ✅ |
| Multi-tenancy (`X-Cod-Plan` header) | ✅ |
| Auth Entra ID JWT (`AUTH_DISABLED=true` para dev) | ✅ |
| Cargas masivas FLUJO / STOCK (Anexo 03.2) | ✅ |
| Documentos: S3 + LocalStorage dev backend | ✅ |
| Búsqueda full-text Postgres (tsvector + pg_trgm) | ✅ |
| Auditoría append-only + UI (Ley 19.628) | ✅ |
| Pagos WebPay (stub esperando SDK Transbank) | ⏳ |
| Notificaciones SES (scheduler diario) | ✅ scheduler / ⏳ envío real |
| PDF reports per atención (pdfkit) | ✅ |
| Prometheus `/metrics` + Grafana dashboard | ✅ |
| Rate limiter (30 r/s · 600 r/m · 10K r/h) | ✅ |
| AWS CDK (Network · Data · Edge · Compute) | ✅ synth-only |
| CI GitHub Actions (build + tests + E2E + CDK synth) | ✅ |
| Backup nightly workflow (pg_dump → S3) | ✅ |
| Migración SQL Server 2008 → Aurora (DMS) | ⏳ requiere acceso fuente |
| MSAL.js login real | ⏳ requiere tenant Entra ID |

## Quick start

```bash
# Requisitos: Node ≥20, pnpm ≥9, Postgres (local o Docker)
pnpm install
docker compose -f infra/docker-compose.yml up -d   # o pg_ctlcluster start
cp apps/api/.env.example apps/api/.env

pnpm db:migrate
pnpm db:seed                 # planes DEMO/EMP01 + 2 afiliados

pnpm api:dev                 # NestJS  → http://localhost:3001/api/docs
pnpm web:dev                 # Angular → http://localhost:4200
pnpm db:studio               # Drizzle Studio UI
```

Detalle operacional, troubleshooting y procedimientos de despliegue:
[`docs/runbook.md`](./docs/runbook.md).

## Arquitectura

```
                    ┌─────────────────┐
                    │   CloudFront    │
                    └────────┬────────┘
                ┌────────────┴───────────┐
                │                        │
         ┌──────▼──────┐         ┌──────▼─────┐
         │   S3 SPA    │         │   ALB+WAF  │
         │  (Angular)  │         └──────┬─────┘
         └─────────────┘                │
                                 ┌──────▼──────┐
                                 │ ECS Fargate │
                                 │  (NestJS)   │
                                 └──┬───┬───┬──┘
                                    │   │   │
                            ┌───────┘   │   └────────┐
                            │           │            │
                     ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐
                     │   Aurora    │ │  S3  │ │ EventBridge │
                     │ Postgres 16 │ │ docs │ │ + SQS + SES │
                     │  Multi-AZ   │ │      │ │ (notif)     │
                     └─────────────┘ └──────┘ └─────────────┘

Auth: Entra ID (OIDC) → MSAL.js → JWT verificado por JWKS
Tenant: header X-Cod-Plan filtra cada query
Observabilidad: CloudWatch logs + /metrics Prometheus + Grafana
```

Detalle por stack: [`docs/propuesta-arquitectura-legalchile.md`](./docs/propuesta-arquitectura-legalchile.md).

## Stack

| Capa | Tech |
|---|---|
| Backend | NestJS 10, Drizzle ORM, PostgreSQL 16, prom-client, nestjs-zod |
| Frontend | Angular 19 standalone, Angular Material (m2 light theme) |
| Auth | Microsoft Entra ID (JWT vía JWKS, `passport-jwt`) |
| Storage | S3 (prod) / LocalFs HMAC-signed URLs (dev) |
| Email | Amazon SES (`SES_ENABLED=true` para enviar) |
| Pagos | Transbank WebPay (stub; integración real pendiente) |
| Infra | AWS CDK (Aurora Serverless v2 + ECS Fargate + ALB + WAF + S3 + CloudFront) |
| Tests | Vitest (27 unit/integration) + Playwright (7 E2E) |
| CI | GitHub Actions (install + build × 2 + test-api + e2e + cdk-synth) |

## Estructura del repo

```
apps/
  api/                NestJS modular monolith
    src/
      common/           guards, decorators (CodPlan, Roles), filters i18n
      db/               Drizzle schema (11 tablas) + migrations + seed
      modules/          auth, usuarios, planes, afiliados, atenciones,
                        gestiones, comites, pagos, cargas-masivas,
                        documentos (S3/local), audit, dashboard, exports
                        (CSV+PDF), notificaciones, metrics, health
    test/integration/   integration tests contra Postgres real
  web/                Angular 19 SPA
    src/app/
      core/             interceptors (cod-plan), services (api wrappers)
      features/         dashboard, afiliados, atenciones (list/form/detail),
                        gestiones, cargas-masivas, pagos, auditoria
packages/shared       Zod schemas + tipos compartidos (api ↔ web)
infra/
  cdk/                AWS CDK app (4 stacks)
  grafana/            dashboard JSON + alertas
  scripts/            backup.sh
  docker-compose.yml  Postgres + Adminer local
tests/e2e/            Playwright specs (chromium)
docs/                 arquitectura + runbook
.github/workflows/    ci.yml, backup-nightly.yml
```

## Tests

```bash
# Unit + integration (necesita DATABASE_URL apuntando a Postgres)
DATABASE_URL=postgres://legalmene:legalmene@localhost:5432/legalmene \
  pnpm --filter @legalmene/api test

# E2E Playwright (asume api + web corriendo)
PLAYWRIGHT_BROWSERS_PATH=/path/to/cache \
  PLAYWRIGHT_SKIP_WEBSERVER=1 \
  pnpm e2e
```

Resultado actual: **27 unit/integration + 7 E2E = 34 verde**.

## Endpoints clave

```
GET  /api/v1/health                            healthcheck con detalle
GET  /api/v1/metrics                           Prometheus scrape
GET  /api/v1/me                                usuario actual
GET  /api/v1/dashboard/kpis                    agregados per-tenant (cache 60s)
GET  /api/v1/dashboard/notificaciones          resumen para bell UI
GET  /api/v1/atenciones?q=...                  full-text + filters
POST /api/v1/atenciones/{consultas|asesorias|juicios}  con correlativo atómico
POST /api/v1/atenciones/:id/derivar            Consulta → Asesoría → Juicio
GET  /api/v1/gestiones?soloVencidas=true       vista operacional cross-atención
POST /api/v1/cargas-masivas/afiliados?tipo=FLUJO|STOCK
POST /api/v1/documentos/upload-url             presigned PUT (S3 o local HMAC)
GET  /api/v1/exports/{afiliados,atenciones}.csv  RFC 4180 + BOM UTF-8
GET  /api/v1/exports/atenciones/:id.pdf        reporte pdfkit
GET  /api/v1/auditoria                         Ley 19.628 trazabilidad
```

Swagger UI: `http://localhost:3001/api/docs`.

## Licencia

MIT — ver [`LICENSE`](./LICENSE).
