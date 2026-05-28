# Legalmene — LegalChile PSL

Sistema de gestión legal SaaS multi-tenant. Reemplazo del sistema legado on-prem.

> Arquitectura y plan de migración: [`docs/propuesta-arquitectura-legalchile.md`](./docs/propuesta-arquitectura-legalchile.md).
> Convenciones de código y estado: [`CLAUDE.md`](./CLAUDE.md).

## Quick start

```bash
# Requisitos: Node ≥20, pnpm ≥9, Docker

pnpm install
docker compose -f infra/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env

pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm api:dev   # NestJS  → http://localhost:3001/api/docs
pnpm web:dev   # Angular → http://localhost:4200
```

## Stack

- Backend: NestJS 10 + Drizzle ORM + PostgreSQL 16
- Frontend: Angular 19 (standalone) + Angular Material
- Auth: Microsoft Entra ID (JWT/JWKS)
- Infra objetivo: AWS (Aurora, ECS Fargate, S3, OpenSearch, SES)

## Estructura

```
apps/api          NestJS API (monolito modular)
apps/web          Angular 19 frontend
packages/shared   Tipos + Zod schemas compartidos
infra/            docker-compose, CDK (pendiente)
docs/             Arquitectura, migración, runbooks
legacy-auto-crm/  CRM Next.js de referencia (Hainrixz/auto-crm)
```

## Licencia

MIT — ver [`LICENSE`](./LICENSE).
