# API versioning strategy

## Status quo

Toda la API vive bajo `/api/v1`. La versión está embebida en el path porque
es el approach más simple para consumidores externos (curl, integraciones)
y para CloudFront/ALB que necesitan rutear sin parsear headers.

## Cuándo bumpear

Un cambio **rompe contrato** si:

- Elimina o renombra un campo de respuesta que clientes podrían leer.
- Cambia el tipo de un campo existente (string → object, número → array).
- Cambia el comportamiento semántico de un endpoint (códigos de retorno,
  efectos secundarios) para escenarios que no son edge cases.
- Endurece validación de entrada en formas que rechazan inputs hoy
  aceptados.

Un cambio es **aditivo** (no requiere bump) si:

- Agrega endpoints nuevos.
- Agrega campos opcionales a payloads existentes (request o response).
- Agrega valores nuevos a un enum siempre que clientes deserialicen
  tolerantes a desconocidos (definir esto contractualmente en docs).
- Agrega cabeceras opcionales.

## Mecánica de bump

Cuando hace falta `v2`:

1. Crear módulo nuevo NestJS con prefix `api/v2` paralelo a `api/v1`.
   Compartir DB schema y servicios; sólo cambia el adaptador (DTOs +
   controllers).
2. Mantener `api/v1` por **mínimo 6 meses** desde el aviso de
   deprecación.
3. Anunciar deprecación con un header en todas las respuestas v1:
   ```
   Sunset: Fri, 31 Dec 2026 23:59:59 GMT
   Deprecation: true
   Link: <https://api.legalchile.cl/api/v2>; rel="successor-version"
   ```
4. CloudWatch alarma sobre tráfico v1 después de la fecha sunset.

## Versionado del frontend

El frontend de LegalChile se considera un cliente más: tiene la misma
política de "deprecación con 6 meses". Antes del sunset el bundle nuevo
ya debe estar deployado contra v2 vía CI.

## Versionado del DB schema

Migraciones Drizzle son monotónicas (`0000`, `0001`, ...). Reglas:

- Toda migración debe ser **forward-only**. No hay `down.sql`.
- Cambios que rompen lectura para versiones anteriores se acompañan de
  un release coordinado: deploy migración + nueva imagen API en el
  mismo cambio.
- Para cambios destructivos (drop column), se usa **expand/contract**:
  1. Release N: agrega columna nueva, doble-escribe ambas.
  2. Release N+1 (al menos 1 sprint después): deja de leer la columna
     vieja.
  3. Release N+2: elimina la columna vieja (migración separada).

## Versionado de SDK / clientes

- Tipos compartidos viven en `packages/shared` y se versionan con el
  monorepo. Cualquier cambio breaking ahí también requiere bump
  semántico del paquete antes de publicarlo si se libera fuera.
- Para clientes externos (integradores) ofrecer OpenAPI spec
  (`/api/docs-json`) y mantener un changelog con dates de
  introducción / deprecación.

## Checklist por PR

- [ ] ¿Toca payload de un endpoint público? ¿Es aditivo?
- [ ] Si es breaking, ¿se documentó en `docs/api-changelog.md`?
- [ ] ¿Hay migración Drizzle? ¿Es forward-only y compatible con la
  imagen API anterior durante el rollout?
- [ ] ¿Se actualizó `packages/shared` y `apps/web`?
- [ ] ¿Tests de contrato (integration + E2E) siguen verdes?
