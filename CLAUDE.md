# CLAUDE.md — Legalmene (LegalChile PSL)

Sistema de gestión legal SaaS para LegalChile. Reemplaza el sistema legado en SQL Server 2008 / Windows Server por una plataforma cloud-native en AWS.

La arquitectura completa, plan de migración y justificación están en
[`docs/propuesta-arquitectura-legalchile.md`](./docs/propuesta-arquitectura-legalchile.md).

Los requerimientos funcionales del cliente (Anexo PSL), las brechas contra este código y
el plan de trabajo están en [`docs/requerimientos-anexo-psl.md`](./docs/requerimientos-anexo-psl.md).
**Ante cualquier duda de negocio, ese documento manda.** Los mockups de la propuesta Tooxs
(Dashboard, Ficha de Caso, Búsqueda y Reportes) guían el diseño visual; sus cifras son de
ejemplo y nunca deben quedar fijas en el código.

### Decisiones vigentes
- Stack: **NestJS + AWS** (no Azure/FastAPI como dice la propuesta Tooxs).
- Documentos: **Amazon S3** con URLs firmadas (el cliente descartó SharePoint).
- El plan es un **producto**, no un tenant: un RUT puede tener varios planes (`planes_afiliado`).

## Estado del proyecto

| Componente | Estado |
|------------|--------|
| Modelo de datos (Drizzle / Postgres) | ✅ Implementado |
| Backend NestJS — auth + módulos core | ✅ Esqueleto funcional |
| Módulos Afiliados / Atenciones / Gestiones / Comités / Pagos | ✅ CRUD base + flujos clave |
| Cargas masivas FLUJO/STOCK | ✅ Implementado |
| Frontend Angular 19 | ✅ Shell + Dashboard + Afiliados + Atenciones + Aranceles + Provisiones |
| Alineación con Anexo PSL | 🟡 Paso 1 (modelo núcleo) listo; pasos 2–5 pendientes (ver `docs/requerimientos-anexo-psl.md` §5) |
| Infraestructura AWS (CDK) | ⏳ Pendiente |
| Migración SQL Server → Postgres | ⏳ Pendiente |
| WebPay producción | ⏳ Stub (esperar SDK Transbank) |
| Auditoría / S3 / OpenSearch | ⏳ Esquema definido, lógica pendiente |

## Stack

- **Backend**: NestJS 10 · TypeScript estricto · Drizzle ORM · PostgreSQL 16
- **Frontend**: Angular 19 (standalone components) · PrimeNG (Aura) · MSAL.js para Entra ID · locale es-CL
- **Auth**: Microsoft Entra ID (OIDC) — JWT verificado vía JWKS
- **Planes (no hay tenant)**: `afiliados` es la persona (RUT único) y `planes_afiliado` guarda
  cada relación RUT–Plan con su vigencia. `atenciones.cod_plan` es el plan bajo el cual se
  atendió. No existe header `X-Cod-Plan`; los listados aceptan `?codPlan=` como filtro opcional.
  El control de acceso por perfil y por propiedad de la atención llega en el paso 4.
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
- **Planes**: nunca filtrar por plan como si fuera tenant. Para saber si un RUT tiene derecho
  a atención usar `planesDeAfiliados()` / `planVigenteSql` (`modules/afiliados/vigencia.ts`):
  vigente = vigencia Activo, fecha_inicio ≤ hoy (Chile), sin término o término ≥ hoy, y plan
  vigente. Sin planes vigentes, la atención solo puede ir como `REZAGADO` o `METLIFE`.
  Correlativos son globales por tipo/año. `usuarios.cod_planes` ya no se aplica (lo reemplaza
  el paso 4).
- **Reglas de negocio clave (Anexo)**: solo planes vigentes permiten nuevas atenciones;
  aranceles son por materia y la cobertura por plan define el copago; una atención con
  arancel impago queda detenida; no se cierra una asesoría/juicio con gestiones o comité
  pendientes; no se pide nueva entrega de provisión con rendiciones pendientes; las
  búsquedas no precargan datos.
- **Sin datos de mockup en el código**: si un valor no existe en la API, mostrar vacío o
  "sin datos", nunca una cifra inventada.
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

El orden funcional está en `docs/requerimientos-anexo-psl.md` §5 (primero el modelo núcleo:
afiliado único + `planes_afiliado`). Pendientes técnicos:

1. Integración real Transbank WebPay (reemplazar stub en `pagos.service.ts`).
2. Notificaciones por correo de vencimientos y flujos (SES).
3. AWS CDK en `infra/` para Aurora + ECS + ALB + S3 (corregir `apps/api/Dockerfile`, que no copia `pnpm-lock.yaml`).
4. Migración SQL Server 2008 → Aurora (AWS DMS + SCT) — ver plan en `docs/`.
