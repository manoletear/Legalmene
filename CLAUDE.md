# CLAUDE.md — Legalmene (LegalChile PSL)

Sistema de gestión legal SaaS para LegalChile. Reemplaza el sistema legado en SQL Server 2008 / Windows Server por una plataforma cloud-native en AWS.

La arquitectura completa, plan de migración y justificación están en
[`docs/propuesta-arquitectura-legalchile.md`](./docs/propuesta-arquitectura-legalchile.md).

## Estado del proyecto

| Componente | Estado |
|------------|--------|
| Modelo de datos (Drizzle / Postgres) | ✅ Implementado |
| Backend NestJS — auth + módulos core | ✅ Esqueleto funcional |
| Módulos Afiliados / Atenciones / Gestiones / Comités / Pagos | ✅ CRUD base + flujos clave |
| Cargas masivas FLUJO/STOCK | ✅ Implementado |
| Frontend Angular 19 | ✅ Shell + Dashboard + Afiliados |
| Infraestructura AWS (CDK) | ⏳ Pendiente |
| Migración SQL Server → Postgres | ⏳ Pendiente |
| WebPay producción | ⏳ Stub (esperar SDK Transbank) |
| Auditoría / S3 / OpenSearch | ⏳ Esquema definido, lógica pendiente |

## Stack

- **Backend**: NestJS 10 · TypeScript estricto · Drizzle ORM · PostgreSQL 16
- **Frontend**: Angular 19 (standalone components) · Angular Material · MSAL.js para Entra ID
- **Auth**: Microsoft Entra ID (OIDC) — JWT verificado vía JWKS
- **Multi-tenancy**: columna `cod_plan` en cada tabla operacional. Header `X-Cod-Plan` filtra acceso.
- **Compute** (objetivo): ECS Fargate (monolito modular) + Lambda para tareas event-driven
- **Storage** (objetivo): Aurora PostgreSQL Multi-AZ + S3 + OpenSearch
- **Local**: Docker Compose (Postgres + Adminer)

## Estructura del repo

```
apps/
  api/                # Backend NestJS
    src/
      db/             # Drizzle schema + migrate + seed
      common/         # Decorators (CodPlan, CurrentUser, Roles), guards, utils
      modules/        # auth, planes, afiliados, atenciones, gestiones,
                      # comites, pagos, cargas-masivas, health
  web/                # Frontend Angular 19
    src/app/
      core/           # Interceptors, services compartidos
      features/       # Vistas por dominio
packages/
  shared/             # Tipos + esquemas Zod compartidos entre API y web
infra/
  docker-compose.yml  # Postgres + Adminer local
docs/
  propuesta-arquitectura-legalchile.md
legacy-auto-crm/      # CRM Next.js incorporado como referencia (Hainrixz/auto-crm)
```

## Comandos

```bash
# Setup inicial
pnpm install

# Levantar Postgres local
docker compose -f infra/docker-compose.yml up -d

# Configurar env
cp apps/api/.env.example apps/api/.env

# DB
pnpm db:generate     # genera migraciones desde el schema
pnpm db:migrate      # las aplica
pnpm db:seed         # planes + usuarios + afiliados demo

# Dev
pnpm api:dev         # NestJS en :3001 con watch (Swagger en /api/docs)
pnpm web:dev         # Angular en :4200

# Build
pnpm api:build
pnpm web:build
```

## Modelo de datos (resumen)

`planes` (catálogo de tenants) → `afiliados` (RUT chileno validado) → `atenciones`
(Consulta/Asesoría/Juicio con correlativo `TIPO-AÑO-NNNNNN`) → `gestiones` (timeline
de acciones por atención) → `comites` + `participantes_comite` (toma de decisiones
multi-rol) → `pagos` (WebPay) y `documentos` (metadata; binarios en S3) y `auditoria`
(append-only para cumplimiento Ley 19.628).

## Reglas de código

- **Idioma UI**: Español. Identificadores también (Atencion, Gestion, Comite) — coincide
  con el lenguaje del Anexo del cliente.
- **Tipos compartidos** entre API y web viven en `packages/shared` (Zod schemas + types
  inferidos). Nunca duplicar tipos entre apps.
- **Multi-tenancy**: TODO endpoint que toque datos de un plan debe usar el decorator
  `@CodPlan()` y verificar que el usuario tiene acceso a ese plan.
- **RUTs**: siempre normalizar con `formatearRut()` antes de comparar/insertar.
- **Soft-delete**: marcar `vigencia: "Eliminado"` en vez de `DELETE` (Ley 19.628 exige
  trazabilidad).
- **Correlativos**: generar con `siguienteCorrelativo()` — usa UPSERT atómico en
  `correlativos` para evitar duplicados bajo concurrencia.
- **Auditoría**: cualquier mutación importante debe escribir un registro en `auditoria`
  (interceptor por implementar).
- **Montos**: enteros (centavos para USD/EUR; pesos chilenos son enteros nativos).
- **Drizzle**: no usar `db.execute(raw)` salvo para casos atómicos (correlativo, upsert
  con xmax). Preferir el query builder tipado.
- **NestJS**: un módulo por bounded context. Sin imports circulares entre módulos
  (exportar servicios cuando se requiera).
- **Tests**: Vitest. Cada servicio con un test happy-path mínimo (pendiente — ver
  TODO en cada módulo).

## TODOs prioritarios

1. Generar primera migración Drizzle (`pnpm db:generate`) y commitear.
2. Implementar interceptor de auditoría que escriba `auditoria` automáticamente.
3. Resolver `usuarios.id` real al validar JWT (upsert por `entraOid` en login).
4. Integración real Transbank WebPay (reemplazar stub en `pagos.service.ts`).
5. Upload presigned URL para S3 en módulo de documentos.
6. Notificaciones de vencimiento de gestiones/comités (EventBridge + SES).
7. AWS CDK en `infra/` para Aurora + ECS + ALB + S3 + OpenSearch.
8. Migración SQL Server 2008 → Aurora (AWS DMS + SCT) — ver plan en `docs/`.
