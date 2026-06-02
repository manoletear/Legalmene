# Informe técnico de estado — Legalmene (LegalChile PSL)

**Versión:** 0.1.0
**Fecha de corte:** Junio 2026
**Branch de referencia:** `claude/auto-crm-skill-YuszQ`
**Repositorio:** `manoletear/Legalmene`

> Documento de handoff para el equipo de desarrollo. Resume estado actual,
> arquitectura, decisiones tomadas, trabajo pendiente y plan recomendado
> de continuación. Pensado para que un desarrollador nuevo pueda ser
> productivo en menos de un día.

---

## 1. Resumen ejecutivo

Sistema legal SaaS multi-tenant que reemplaza el sistema PSL legado de
LegalChile (SQL Server 2008 + Windows Server) por una plataforma cloud-
native en AWS. Implementa el flujo completo del Anexo: Atenciones
(Consulta → Asesoría → Juicio), gestiones, comités con votación, cargas
masivas FLUJO/STOCK del padrón de afiliados, pagos WebPay, documentos
y trazabilidad para Ley 19.628.

**Estado:** demo funcional end-to-end. **No está en producción.** El
camino de demo a piloto se documenta en la sección 11.

**Métricas del repo:**
- ~25.000 líneas de TypeScript productivo (sin lockfiles ni node_modules)
- 5 migraciones Drizzle aplicadas (modelo estable)
- 27 tests unit/integration + 11 E2E Playwright + 9 smoke checks = **47 verde**
- ESLint strict (max-warnings 0) clean
- CI con build + test + e2e + cdk synth + sbom + migration drift gate

---

## 2. Arquitectura

### 2.1 Topología de despliegue (objetivo)

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
                     │  Multi-AZ   │ │      │ │             │
                     └─────────────┘ └──────┘ └─────────────┘
```

### 2.2 Decisiones arquitectónicas clave (ya tomadas)

| Decisión | Elección | Justificación |
|---|---|---|
| Estilo backend | Monolito modular NestJS | Equipo pequeño, baja complejidad operacional. Microservicios sólo si se justifica con dolor real. |
| Multi-tenancy | Row-level por `cod_plan` | Más simple. Schema-per-tenant queda como escape si llegan > 50 tenants. |
| Identity Provider | Microsoft Entra ID directo (sin Cognito) | Cliente ya tiene M365. Cognito agrega complejidad sin beneficio. |
| Frontend | Angular 19 standalone + Material | Tipado fuerte, formularios reactivos complejos. Material da consistencia. |
| ORM | Drizzle | Tipado, SQL inspeccionable, control fino sobre queries. Prisma rechazado por overhead de generación. |
| Storage | S3 (prod) / Local FS (dev) | Mismo interface, swap por env. Dev no requiere AWS creds. |
| Validación | Zod en `packages/shared` | Mismo schema en API y web. nestjs-zod hace el bridge a DTOs Nest. |
| Pagos | Transbank WebPay (stub esperando SDK) | Aún sin commerce code de cliente. Lugar reservado, no implementado. |
| Observabilidad | prom-client + CloudWatch | Métricas en Prometheus text format, scrapeable por Grafana o AMP. |

### 2.3 Patrones recurrentes en el código

- **Tenant scope:** cada endpoint operacional usa `@CodPlan()` que extrae
  `X-Cod-Plan` del request, valida que el usuario tiene acceso, y pasa
  como primer argumento al service. Todo query filtra por `cod_plan`.
- **Soft delete:** `vigencia = "Eliminado"` con `fechaEgreso`. Nunca
  `DELETE FROM`. Cumplimiento Ley 19.628.
- **Correlativos atómicos:** tabla `correlativos (cod_plan, tipo, anio)`
  con UPSERT que incrementa contador. Probado con 20 inserts paralelos.
- **Audit interceptor:** APP_INTERCEPTOR global escribe `auditoria`
  append-only en cada mutación. JSONB con before/after.
- **Maintenance interceptor:** `MAINTENANCE_MODE=true` rechaza
  mutaciones con 503 + Retry-After; lecturas pasan.
- **i18n filter:** ZodError + HttpException → payload español
  normalizado `{ statusCode, error, message, errores, timestamp, path }`.

---

## 3. Stack tecnológico

### 3.1 Backend (apps/api)

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | ≥ 20 |
| Framework | NestJS | 10.4 |
| Lenguaje | TypeScript estricto | 5.7 |
| ORM | Drizzle | 0.36 |
| DB | PostgreSQL | 16 (Aurora en prod) |
| Auth | passport-jwt + jwks-rsa (Entra ID) | — |
| Validación | Zod + nestjs-zod | 3.23 |
| Métricas | prom-client | 15 |
| Scheduling | @nestjs/schedule | 4.1 |
| AWS | @aws-sdk/client-s3, client-ses | 3.7 |
| PDF | pdfkit | 0.15 |
| Cache | @nestjs/cache-manager (in-memory) | 2.3 |
| Rate limit | @nestjs/throttler | 6.4 |
| Tests | Vitest + @nestjs/testing | 2.1 |

### 3.2 Frontend (apps/web)

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Angular 19 standalone | 19.0 |
| UI | Angular Material (m2 light theme) | 19.0 |
| Forms | Reactive Forms | — |
| State | Signals nativas (no NgRx) | — |
| Auth (objetivo) | @azure/msal-angular | 4.0 |
| Tipos compartidos | `@legalmene/shared` (workspace) | — |
| Tests | Playwright | 1.56 |

### 3.3 Infraestructura

| Capa | Tecnología |
|---|---|
| IaC | AWS CDK (TypeScript) |
| Compute | ECS Fargate |
| DB | Aurora PostgreSQL Serverless v2 Multi-AZ |
| Storage | S3 documents + S3 frontend + CloudFront |
| Network | VPC 3-AZ, ALB + WAF |
| Secrets | AWS Secrets Manager |
| KMS | Customer-managed key |
| Logs | CloudWatch Logs |
| Metrics | Prometheus scrape (`/api/v1/metrics`) → Grafana |
| Backup | pg_dump → S3 STANDARD_IA (workflow nightly) |
| CI/CD | GitHub Actions |

---

## 4. Estructura del repositorio

```
apps/
  api/                NestJS modular monolith
    src/
      common/           guards, decorators (CodPlan, Roles),
                        filters i18n, interceptors maintenance
      db/               Drizzle schema (12 tablas) + migrations + seed
      modules/          auth, usuarios, planes, afiliados, atenciones,
                        gestiones, comites, pagos, cargas-masivas,
                        documentos (S3/local), audit (+archive),
                        dashboard (cache), exports (CSV+PDF),
                        notificaciones (SES), metrics, webhooks,
                        health
    test/integration/   integration tests contra Postgres real
  web/                Angular 19 SPA
    src/app/
      core/             interceptors (cod-plan, maintenance),
                        services (api wrappers)
      features/         dashboard, afiliados, atenciones
                        (list/form/detail con 3 tabs),
                        gestiones (vista global), cargas-masivas,
                        pagos, auditoria, admin/usuarios,
                        admin/webhooks
packages/shared       Zod schemas + tipos compartidos (api ↔ web)
infra/
  cdk/                AWS CDK app (4 stacks: Network/Data/Edge/Compute)
  grafana/            dashboard JSON + alertas
  postman/            collection auto-generada desde OpenAPI
  scripts/            backup.sh, smoke.sh, postman.sh
  docker-compose.yml  Postgres + Adminer local
tests/e2e/            Playwright specs (chromium)
docs/                 arquitectura, runbook, api-versioning
.github/workflows/    ci.yml, sbom.yml, migration-check.yml,
                      backup-nightly.yml
legacy-auto-crm/      referencia original Hainrixz/auto-crm
```

---

## 5. Módulos implementados

### 5.1 Backend

| Módulo | Endpoints | Estado |
|---|---|---|
| `auth` | JWT Entra ID validation + dev bypass | ✅ con `AUTH_DISABLED=true` para dev |
| `usuarios` | `/me`, `/admin/usuarios` GET/PATCH | ✅ |
| `planes` | CRUD plan/tenant | ✅ |
| `afiliados` | CRUD + búsqueda full-text + soft delete | ✅ |
| `atenciones` | CRUD + Consulta/Asesoría/Juicio + derivar + búsqueda FTS | ✅ |
| `gestiones` | CRUD por atención + listado global per-tenant | ✅ |
| `comites` | convocar + votar + cerrar + acta | ✅ |
| `pagos` | iniciar + confirmar + listar | ⏳ stub (SDK Transbank pendiente) |
| `cargas-masivas` | upload CSV FLUJO/STOCK | ✅ |
| `documentos` | presigned URL S3 / local HMAC | ✅ |
| `audit` | listar + archive cron (>1 año a JSONL.gz) | ✅ |
| `dashboard` | KPIs + timeline + cache 60s | ✅ |
| `exports` | CSV afiliados/atenciones + PDF por atención | ✅ |
| `notificaciones` | scheduler diario + SES | ✅ scheduler / ⏳ envío real (SES_ENABLED) |
| `metrics` | Prometheus text format | ✅ |
| `webhooks` | suscripciones + dispatcher HMAC + retry backoff | ✅ |
| `health` | live + readiness con db latency + storage detail | ✅ |

### 5.2 Frontend

| Vista | Estado |
|---|---|
| Dashboard con KPIs + sparkline 30d | ✅ |
| Afiliados list paginada + export | ✅ |
| Atenciones list + form crear + detail con 3 tabs (gestiones/comités/documentos) | ✅ |
| Gestiones vista operacional cross-atención | ✅ |
| Cargas masivas FLUJO/STOCK con UI de resultado | ✅ |
| Pagos historial + iniciar (stub) | ✅ |
| Auditoría con filtros y diff JSON | ✅ |
| Admin Usuarios (CRUD + rol + activo) | ✅ |
| Admin Webhooks (CRUD + entregas + reintentar) | ✅ |
| Bell de notificaciones con badge | ✅ |
| Banner mantenimiento (HTTP 503 interceptor) | ✅ |
| Login MSAL real | ⏳ scaffolding, no implementado |

### 5.3 No implementado pero esperado

- Login MSAL real contra tenant Entra ID
- WebPay integración real (SDK Transbank)
- Migración SQL Server → Aurora (DMS execution)
- OpenSearch indexación documental
- App móvil

---

## 6. Modelo de datos

### 6.1 Tablas operacionales (12)

```
planes (catálogo de tenants)
  └─> usuarios (Entra OID, rol, codPlanes accesibles)
  └─> afiliados (RUT chileno validado, vigencia soft-delete)
       └─> atenciones (correlativo TIPO-AÑO-NNNNNN per-plan unique)
            ├─> gestiones (timeline + responsable + fechaCompromiso)
            ├─> comites + participantes_comite (multi-rol, voto)
            ├─> pagos (WebPay, orden de compra ulid)
            └─> documentos (S3 key + sha256, metadata)
  └─> webhooks_suscripciones (eventos + secret HMAC)
       └─> webhook_entregas (cola con backoff)
  └─> auditoria (append-only para Ley 19.628)
  └─> correlativos (secuencias per-plan/tipo/año, UPSERT atómico)
```

### 6.2 Convenciones de DB

- `cod_plan` en cada tabla operacional como tenant_id.
- Timestamps `withTimezone: true` siempre.
- `id` UUID v4 (defaultRandom).
- Enums Postgres nativos (no varchar libre).
- Índices compuestos sobre (cod_plan, otra columna) para escaneos por tenant.
- Search_vector tsvector con trigger BEFORE INSERT/UPDATE (no GENERATED
  porque `to_tsvector` es STABLE no IMMUTABLE).

### 6.3 Migraciones

```
0000_grey_lord_hawal       schema inicial (11 tablas)
0001_search_indexes        full-text search (atenciones + afiliados)
0002_correlativo_per_plan  fix unique scope (bug atrapado por test)
0003_rare_tenebrous        sync de snapshot Drizzle
0004_fixed_diamondback     webhooks (suscripciones + entregas)
```

**Política:** forward-only. Sin `down.sql`. Cambios destructivos siguen
patrón expand/contract (ver `docs/api-versioning.md`).

---

## 7. Testing

### 7.1 Suite actual

| Tipo | Count | Ubicación |
|---|---|---|
| Unit | 10 | `apps/api/src/common/utils/rut.spec.ts` |
| Integration (con Postgres real) | 17 | `apps/api/test/integration/` |
| E2E Playwright | 11 | `tests/e2e/specs/` |
| Smoke (curl shell) | 9 | `infra/scripts/smoke.sh` |
| **Total green** | **47** | — |

### 7.2 Cómo correr

```bash
# Unit + integration (necesita DATABASE_URL)
DATABASE_URL=postgres://legalmene:legalmene@localhost:5432/legalmene \
  pnpm --filter @legalmene/api test

# E2E (asume api + web corriendo)
PLAYWRIGHT_BROWSERS_PATH=/path/to/cache \
  PLAYWRIGHT_SKIP_WEBSERVER=1 \
  pnpm e2e

# Smoke contra API desplegada
API_BASE=https://api.example.com/api/v1 \
  X_COD_PLAN=DEMO \
  ./infra/scripts/smoke.sh

# Lint
pnpm lint:strict  # max-warnings 0, falla si hay 1
```

### 7.3 Bugs reales capturados por tests

1. **Correlativo unique scope** (atrapado por test de 20 inserts paralelos):
   `atenciones.correlativo` tenía unique global pero el generador emite
   per-plan. Migración 0002 cambia a unique compuesto (cod_plan, correlativo).
2. **NestJS DI sin decorator metadata en vitest**: el esbuild loader de
   vitest no emite `Reflect.metadata`, por lo que toda inyección de
   constructor debe usar `@Inject(Class)` explícito. Documentado para
   evitar regresiones.

---

## 8. CI/CD

### 8.1 Workflows GitHub Actions

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push/PR | install → lint, build-api, build-web, test-api, e2e, cdk-synth |
| `sbom.yml` | push/PR + weekly | CycloneDX cdxgen + npm audit |
| `migration-check.yml` | PR si toca schema/migrations | `db:generate` debe ser idempotente (no diff) |
| `backup-nightly.yml` | cron 06:00 UTC | pg_dump → S3 STANDARD_IA (gated en `BACKUP_ENABLED=true`) |

### 8.2 Gates de calidad sugeridos antes de merge

- ✅ Build api + web
- ✅ Tests unit/integration verde
- ✅ Lint strict (0 warnings)
- ✅ E2E Playwright verde
- ✅ CDK synth válido
- ✅ Migration drift check
- ⏳ Coverage mínimo (no configurado aún — recomendación 70% líneas críticas)
- ⏳ Dependabot updates revisados

---

## 9. Deuda técnica conocida

### 9.1 Crítica (bloquea producción)

| Item | Acción requerida | Quien |
|---|---|---|
| MSAL.js login real | Configurar tenant Entra ID, registrar app, wire callback | Frontend + IT cliente |
| Transbank WebPay real | Integrar SDK `transbank-sdk-nodejs`, callback HMAC, ambiente integración → producción | Backend + finanzas cliente |
| AWS CDK deploy real | Bootstrap account, ajustar context vars, deploy dev/staging | DevOps |
| Migración SQL Server | AWS SCT report + DMS configuración + corte planificado | DBA + dev senior |
| Headers de seguridad | HSTS, CSP estricto, X-Frame-Options en ALB/CloudFront | DevOps |
| Pen test inicial | OWASP Top 10 + corrección de findings | Security partner |

### 9.2 Importante (no bloquea pero degrada experiencia)

| Item | Acción |
|---|---|
| Notificaciones SES en vivo | Configurar dominio SES, `SES_ENABLED=true`, alertas reales |
| OpenSearch para búsqueda documental | Crear domain, indexar via Lambda S3 events + Textract OCR |
| Tests de carga | k6 o Artillery contra Aurora con dataset realista |
| Drift de schema vs prod | Validar que migraciones aplicadas en cada ambiente son las esperadas |
| Theme cliente-específico | Logo por plan, colores brand (hoy es genérico LegalChile) |
| Mobile real | Responsive ya está, falta PWA install banner + offline-first |
| i18n preparation | Hoy todo es español hardcoded. Si llegan otros mercados, prep ngx-translate |

### 9.3 Nice-to-have

| Item | Acción |
|---|---|
| Tableros embebidos | QuickSight o Metabase, con SSO |
| Calendario abogado | Vista calendario de gestiones por responsable |
| App móvil nativa | Capacitor sobre el bundle actual o React Native nuevo |
| AI features | Clasificación automática de tipo de atención, resumen de comité, autocomplete de escritos |
| e-firma | Integración con E-Sign Pro u homólogo chileno |
| Onboarding wizard | Setup inicial del primer admin + primer plan |

---

## 10. Onboarding del equipo

### 10.1 Setup local (< 1 hora)

```bash
# Requisitos: Node ≥ 20, pnpm ≥ 9, Postgres 16 (Docker o nativo)
git clone http://repo/manoletear/Legalmene
cd Legalmene
pnpm install

# Postgres
docker compose -f infra/docker-compose.yml up -d
# o: pg_ctlcluster 16 main start

# Configurar API
cp apps/api/.env.example apps/api/.env

# DB
pnpm db:migrate
pnpm db:seed

# Dev servers
pnpm api:dev   # NestJS  → http://localhost:3001/api/docs
pnpm web:dev   # Angular → http://localhost:4200
pnpm db:studio # Drizzle Studio UI
```

### 10.2 Documentos clave

1. **`README.md`** — overview y quick start.
2. **`CLAUDE.md`** — convenciones de código y estado.
3. **`docs/propuesta-arquitectura-legalchile.md`** — arquitectura completa.
4. **`docs/runbook.md`** — operaciones, incidentes comunes, despliegue.
5. **`docs/api-versioning.md`** — política de versionado.
6. **`apps/api/.env.example`** — todas las variables de entorno con notas.

### 10.3 Convenciones de código (extracto)

- **Idioma:** identificadores en español (`Atencion`, `Gestion`,
  `Comite`) porque coincide con el lenguaje del Anexo del cliente.
- **Tipos compartidos** entre API y web SIEMPRE vía `packages/shared`.
  Nunca duplicar tipos.
- **Multi-tenancy:** todo endpoint operacional debe usar `@CodPlan()`.
- **RUT:** siempre normalizar con `formatearRut()` antes de comparar/insertar.
- **Soft delete:** `vigencia: "Eliminado"`, no DELETE.
- **Correlativos:** `siguienteCorrelativo()`, no incrementos manuales.
- **Auditoría:** automática vía `AuditInterceptor`. No invocar manual.
- **Montos:** enteros (centavos para USD/EUR, pesos para CLP nativos).
- **Drizzle:** preferir query builder. `db.execute(raw)` sólo para
  upserts atómicos (correlativos).
- **NestJS:** un módulo por bounded context. Sin imports circulares.
- **Tests:** cada service nuevo debe tener al menos 1 happy-path
  integration test.
- **Inyección:** usar `@Inject(Class)` explícito en constructores —
  vitest no emite decorator metadata.

### 10.4 Flujo de trabajo recomendado

1. Branch desde `main`: `feature/<nombre-corto>`.
2. Commits descriptivos siguiendo Conventional Commits.
3. PR contra `main`. CI debe estar verde:
   - lint:strict (0 warnings)
   - tests verdes
   - cdk synth limpio
   - migration drift check si tocaste schema
4. Code review por al menos 1 par.
5. Merge a `main` desencadena (futuro) deploy automático a staging.

---

## 11. Decisiones pendientes que el equipo debe tomar

### 11.1 Arquitectura

| Decisión | Cuándo decidir | Opciones |
|---|---|---|
| Multi-tenancy: row-level vs schema-per-tenant | Antes del cliente N°10 | Row-level (actual) escala hasta ~50 tenants. Schema-per-tenant da aislamiento físico pero complica migraciones. |
| Workflow engine | Antes de Q2 | (a) Step Functions, (b) Temporal, (c) BullMQ. Tema: representar flujos legales con plazos procesales y estados intermedios. |
| Versionado de tipos compartidos | Cuando se incorpore primer cliente integrador externo | Hoy `packages/shared` vive en monorepo. Para terceros, publicar en npm registry privado (CodeArtifact). |
| Feature flags | Cuando aparezca el primer cliente con SLA distinto | (a) DB-backed simple, (b) Unleash self-host, (c) LaunchDarkly SaaS. |

### 11.2 Producto

| Decisión | Cuándo | Notas |
|---|---|---|
| Búsqueda jurisprudencia con LLM | Q3+ | Cliente debe pedirla. Hay costo recurrente significativo. |
| Mobile app | Después de piloto | Decidir si PWA basta o se necesita React Native. |
| Modelo de pricing | Antes del primer contrato | Por usuario / por plan / por volumen. Define infra y reporting. |
| Soporte e-firma | Q2+ | Definir provider chileno (Acepta, E-Sign Pro). |

### 11.3 Operación

| Decisión | Cuándo | Notas |
|---|---|---|
| Estrategia de deploy | Antes de prod | Blue/green vs rolling. Hoy CDK genera rolling con circuit breaker. |
| Política de retención | Antes de prod | Documentos 5 años (Ley 19.628), auditoría > 5 años, backups 90 días. Validar con jurídico cliente. |
| Soporte multi-región | Q4+ | Aurora Global Database vs single-region + cold DR. |
| SLA de operación | Antes de prod | 99.9% uptime, RTO 1h, RPO 5min son números de propuesta; deben firmarse con cliente. |

---

## 12. Roadmap recomendado (12 meses)

### Q3 2026 (Jul-Sep) — Producción mínima viable

- [ ] CDK deploy real (dev + staging)
- [ ] MSAL login real contra tenant Entra ID cliente
- [ ] WebPay integración completa (commit, refund, anular)
- [ ] Pen test + remediaciones (OWASP Top 10, headers)
- [ ] Migración piloto con datos anonimizados de cliente
- [ ] Tests de carga + tuning Aurora
- [ ] DPIA Ley 19.628 formal
- [ ] Backup restore drill mensual ejecutado y documentado
- [ ] SLA contractual firmado

### Q4 2026 (Oct-Dic) — Piloto real

- [ ] Onboarding cliente piloto (1 plan, ≤ 10K afiliados)
- [ ] Migración SQL Server → Aurora full (DMS + corte)
- [ ] Notificaciones SES en vivo
- [ ] Reportería embebida (QuickSight)
- [ ] Capacitación a usuarios cliente
- [ ] App móvil read-only (PWA o nativa según decisión)
- [ ] Hardening: WAF rules tuneadas, CloudFront con dominio cliente

### Q1 2027 (Ene-Mar) — Escala

- [ ] Onboarding clientes 2-5
- [ ] OpenSearch indexación documental (Textract OCR)
- [ ] Workflow engine para flujos legales complejos
- [ ] Integraciones externas (Receptor SII, CBR si aplica)
- [ ] Multi-región DR ready
- [ ] SOC 2 light audit prep

### Q2 2027 (Abr-Jun) — Madurez

- [ ] Self-service onboarding (plan crea cuenta + branding)
- [ ] API pública para integradores con OAuth2 client credentials
- [ ] Reducción de costos: Reserved Instances, optimización queries
- [ ] AI features (clasificación, resumen, autocomplete) — sólo si cliente las pide
- [ ] Auditoría externa de seguridad completa

---

## 13. Riesgos

### 13.1 Técnicos

| Riesgo | Mitigación actual | Acción adicional |
|---|---|---|
| Bug en correlativo bajo concurrencia | Integration test con 20 inserts paralelos | Considerar mover a SEQUENCE Postgres si > 10 ops/seg sostenidos |
| Cargas masivas FLUJO bloquean DB | Procesado en transacción única | Tests de carga con 200K filas antes de prod |
| Documentos S3 sin antivirus | Pendiente | ClamAV en Lambda o S3 Object Lambda + cuarentena bucket |
| Path traversal en upload | Sanitización de nombre actual | Añadir verificación de mime real, no sólo extensión |
| Inyección SQL via filtros search | Drizzle parametriza todo | Mantener prohibición de `db.execute(raw)` sin revisión |
| Audit log infinito | Cron mensual archive > 1 año | Validar restore desde JSONL.gz en drills |

### 13.2 De producto

| Riesgo | Mitigación |
|---|---|
| Modelo no representa la realidad del cliente | Reunión con stakeholders ANTES de Q3 para validar campos faltantes (ej. RIT/ROL judicial, RUT empleador) |
| Migración SQL Server más compleja que lo previsto | Conseguir dump fuente AHORA para SCT report temprano |
| Resistencia cultural al cambio | Capacitación intensiva + soporte intensivo primer mes |
| Cliente pide features no contemplados | Roadmap flexible, gestión de scope rigurosa |

### 13.3 De operación

| Riesgo | Mitigación |
|---|---|
| Costo AWS supera presupuesto | Reserved Instances + alertas AWS Budgets + revisión mensual |
| Incidente sin runbook | `docs/runbook.md` tiene 4 playbooks; ampliar con cada incidente real |
| Dependencia de un solo desarrollador clave | Documentación + pair programming en cada feature nueva |

---

## 14. Recursos y contactos

### 14.1 Documentos del repo

- `README.md` — overview
- `CLAUDE.md` — convenciones
- `docs/propuesta-arquitectura-legalchile.md` — arquitectura detallada
- `docs/runbook.md` — operación
- `docs/api-versioning.md` — política versionado
- `docs/handoff-report.md` — **este documento**
- `infra/grafana/README.md` — observabilidad
- `infra/cdk/README.md` — IaC
- `tests/e2e/playwright.config.ts` — E2E setup

### 14.2 Endpoints clave

| URL | Propósito |
|---|---|
| `http://localhost:3001/api/docs` | Swagger UI |
| `http://localhost:3001/api/v1/health` | Health check con detalle |
| `http://localhost:3001/api/v1/metrics` | Prometheus scrape |
| `http://localhost:3001/api/docs-json` | OpenAPI spec (input para Postman) |
| `http://localhost:4200` | Angular SPA |

### 14.3 Comandos útiles

```bash
pnpm api:dev          # Backend en watch
pnpm web:dev          # Frontend en watch
pnpm db:studio        # UI sobre schema Drizzle
pnpm db:generate      # Generar migración desde schema TS
pnpm db:migrate       # Aplicar migraciones pendientes
pnpm db:seed          # Datos demo
pnpm lint:strict      # Lint con max-warnings 0
pnpm test             # Todos los tests
pnpm e2e              # Playwright E2E
./infra/scripts/backup.sh     # Backup manual
./infra/scripts/smoke.sh      # Smoke test contra API live
./infra/scripts/postman.sh    # Regenerar collection Postman
```

---

## 15. Recomendación final

El sistema está en un punto donde **agregar más features sin contacto
con usuario real es deuda potencial**. La recomendación es cambiar el
modo de "construir más" a "hacer aterrizar":

1. **Semanas 1-2:** deploy a AWS dev real + smoke contra infra real.
2. **Semana 3:** pen test light + remediaciones (headers de seguridad,
   findings de OWASP Top 10).
3. **Semanas 4-5:** conseguir cliente piloto comprometido + dump SQL
   Server fuente.
4. **Semanas 6-9:** piloto vivo con 5 usuarios internos del cliente,
   ajustes según feedback diario.

Después de eso, sabrás qué de la lista de features pendientes vale
realmente y qué no. Cualquier feature agregado ahora sin validación
de usuario real es riesgo de rework.

---

**Versión del documento:** 1.0
**Mantenedor:** equipo de desarrollo Legalmene
**Próxima revisión:** al cerrar Q3 2026 o al onboarding del primer cliente piloto
