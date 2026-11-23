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
| Frontend Angular 19 | ✅ Shell + Dashboard + Afiliados + Atenciones + Aranceles + Provisiones + Derivaciones + Finanzas |
| Alineación con Anexo PSL | ✅ Fase 1 del plan de cumplimiento (operable desde la web). ✅ Pasos 1–5 (5a búsquedas sin precarga, XLSX, reportes, controller; 5b cargas, bienes, posesión efectiva). Pendientes en `docs/requerimientos-anexo-psl.md` §5 |
| Infraestructura AWS (CDK) | 🟡 Escrita en `infra/cdk` (Aurora, ECS, S3, WAF); no desplegada |
| Migración SQL Server → Postgres | ⏳ Pendiente |
| WebPay producción | ⏳ Stub (esperar SDK Transbank) |
| Auditoría / S3 / OpenSearch | ⏳ Esquema definido, lógica pendiente |

## Stack

- **Backend**: NestJS 10 · TypeScript estricto · Drizzle ORM · PostgreSQL 16
- **Frontend**: Angular 19 (standalone components) · PrimeNG (Aura) · locale es-CL. MSAL está instalado pero
  **el login con Entra ID aún no está conectado en la web** (solo el backend valida sus tokens; ver plan, fase 7)
- **Auth**: login con enlace de acceso (magic link, `/login`) + Microsoft Entra ID (OIDC, JWT vía JWKS)
- **Planes (no hay tenant)**: `afiliados` es la persona (RUT único) y `planes_afiliado` guarda
  cada relación RUT–Plan con su vigencia. `atenciones.cod_plan` es el plan bajo el cual se
  atendió. No existe header `X-Cod-Plan`; los listados aceptan `?codPlan=` como filtro opcional.
  El acceso se define por perfil (permisos) y por propiedad de la atención (ver Reglas).
- **Compute** (objetivo): ECS Fargate (monolito modular) + Lambda para tareas event-driven
- **Storage** (objetivo): Aurora PostgreSQL Multi-AZ + S3 + OpenSearch
- **Local**: Docker Compose (Postgres + Adminer)

## Estructura del repo

```
apps/
  api/                # Backend NestJS
    src/
      db/             # Drizzle schema + migrate + seed
      common/         # acceso/ (contexto y alcance), decorators (CurrentUser, Permiso), guards, utils
      modules/        # auth, planes, afiliados, atenciones, gestiones,
                      # comites, pagos, cargas-masivas, maestros, aranceles,
                      # coberturas, provisiones, exports, reportes,
                      # posesiones, health
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

`planes` (productos, con `canal`) ← `planes_afiliado` (vigencias RUT–Plan) → `afiliados`
(persona, RUT único) → `atenciones` (Consulta/Asesoría/Juicio con correlativo
`TIPO-AÑO-NNNNNN`, plan bajo el que se atendió, `competencia_id`/`materia_id` de los maestros y
`asunto` libre). Maestros: `competencias` → `materias`/`procedimientos`, `tribunales`,
`organismos`, `tipos_consulta`, `causas_termino`, `calidades_procesales`. Finanzas:
`aranceles` (por materia y tipo opcional, en UF×100) + `coberturas` (por plan) + `valores_uf`
→ copago; `provisiones` + `provision_movimientos`. → `gestiones` (timeline
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
  Correlativos son globales por tipo/año.
- **Maestros**: competencias, materias, canales, regiones, ciudades y comunas, etc. son tablas con `vigente` (nunca enums ni listas
  fijas en el frontend). Leerlos con `GET /maestros/:tipo`; modificarlos exige `maestros.administrar`.
  Desactivar oculta el valor en formularios nuevos sin tocar registros históricos.
  Ciudades y comunas cuelgan de una región; el afiliado guarda región, ciudad y comuna como texto (listas editables en el
  formulario) para no depender del maestro en cargas masivas ni en datos históricos.
- **Aranceles y copago**: el arancel es por materia (+ tipo opcional; el específico gana) y es
  igual para todos los planes. El copago sale de `calcularCopago()`
  (`modules/coberturas/copago.ts`): regla del plan más específica (materia+tipo → materia →
  tipo → general); Porcentaje = arancel × (100−%); ValorUF = precio fijo; sin regla o
  SinCobertura = arancel completo. Nunca calcular copagos en el frontend.
- **Estados de atención**: nunca escribir `atenciones.estado` a mano en un flujo nuevo; usar
  `AtencionesService.cambiarEstado()` (valida el mapa de `estados-atencion.ts` y los requisitos
  por etapa de `modules/atenciones/estados.ts`). "Derivada" solo la asigna la aprobación de una
  derivación. Asesorías y juicios pasan a "Terminada" solo con V°B° de jefatura: `solicitarTermino()` (valida
  requisitos al pedirlo) y `aprobarTermino()`/`rechazarTermino()` (`atenciones.aprobar_termino`, nunca quien
  solicitó); `cambiarEstado()` rechaza el paso directo. Si el plan no cubre la materia (regla "SinCobertura" o sin regla, con
  arancel definido), la atención queda con `autorizacion_cobertura` Pendiente y no entra a estados de trabajo
  hasta que Gerencia de Servicios la autorice (`atenciones.autorizar_sin_cobertura`); rechazada, solo se abandona. Las actualizaciones automáticas (gestión creada, comité) solo avanzan desde el
  estado esperado (p. ej. Pendiente → EnGestion).
- **Arancel por atención y provisiones**: transiciones solo vía `ArancelesAtencionService` y
  `ProvisionesService` (mapas `TRANSICIONES_ARANCEL` / `TRANSICIONES_PROVISION` en shared); cada
  cambio escribe su fila de eventos. Aprobar exige `aranceles_atencion.aprobar` / `provisiones.autorizar`
  (jefaturas); registrar pagos `*.registrar_pago` (Contador); disponer y entregar fondos
  `provisiones.disponer_entregar` (Finanzas). El CLP de un arancel usa la UF de la fecha de pago. Cuenta de la atención = pagado por el cliente − gastos −
  devuelto al cliente. El abogado solo registra gastos y rinde; el saldo no gastado lo registra el contador como
  reingreso (`provisiones.registrar_pago`, estado Reingresado). Rendición al cliente (`rendiciones_cliente`): el
  abogado la solicita, Finanzas registra el cheque por el saldo total (sin fondos por rendir/reingresar ni entregas
  en curso) y el abogado marca "rendido a cliente" (provisiones → RendidaCliente). Comprobantes PDF con
  `dibujarComprobante()` (`modules/exports/comprobantes-pdf.service.ts`).
- **Login con enlace de acceso**: `POST /auth/enlace` siempre responde 202 (no revela si el correo
  existe); solo usuarios activos, no bloqueados y del dominio permitido reciben enlace (máx. 3 cada
  15 min). El token es de un solo uso, vence en 15 min y se guarda solo su hash (`enlaces_acceso`).
  `POST /auth/enlace/verificar` lo canjea por una sesión propia (JWT HS256, 8 h, `SESSION_JWT_SECRET`)
  que `JwtAuthGuard` acepta antes que Entra ID. Con `AUTH_DISABLED=true` el enlace se devuelve en la
  respuesta (demo sin correo); nunca en producción. Altas de usuario: `POST /admin/usuarios`
  (`usuarios.administrar`, dominio permitido, misma delegación que al cambiar perfil); quedan con `entra_oid`
  `enlace:<correo>` y Entra ID los vincula por correo en su primer ingreso. `BOOTSTRAP_ADMIN_EMAILS` acepta
  correos exactos o dominios con `@` inicial.
  Canjear un enlace propio ya usado o vencido es un intento fallido (`usuarios.intentos_fallidos`); al tercero la
  cuenta se bloquea y se avisa a los administradores (salvo el último administrador activo, que solo genera aviso).
  Un ingreso exitoso o el desbloqueo reinician el contador.
- **Permisos**: no existen roles fijos. Todo endpoint que modifique datos (o exponga un módulo
  restringido) lleva `@UseGuards(JwtAuthGuard, PermisosGuard)` + `@Permiso("clave")` con una
  clave del catálogo `PERMISOS` (`packages/shared/src/types/permisos.ts`); si falta una clave,
  agregarla al catálogo (y a los perfiles que corresponda vía migración). En el frontend usar
  `MeService.tiene()`/`algunoDe()`, la directiva `*lmPermiso` y `permisoGuard()` en rutas;
  nunca comparar nombres de perfil. El perfil `ADMIN` tiene siempre todos los permisos.
- **Alcance de atenciones**: toda lectura de atenciones o de algo que cuelga de una atención
  (gestiones, comités, documentos, provisiones, arancel, derivaciones, exportaciones, dashboard)
  debe pasar por `filtroAtenciones()` o `asegurarAtencionVisible()` (`common/acceso/alcance.ts`).
  Lo que el usuario no ve responde 404, nunca 403. El usuario actual viaja en el contexto del
  request (`common/acceso/contexto.ts`); sin contexto (scheduler, seed) no hay restricción.
  Las cachés de resultados acotados deben incluir `claveAlcance()` en la clave.
- **Reglas de negocio clave (Anexo)**: solo planes vigentes permiten nuevas atenciones;
  aranceles son por materia y la cobertura por plan define el copago; una atención con
  arancel impago queda detenida (solo admite gestiones de contacto: llamada, correo, reunión) y un juicio no
  inicia la tramitación con provisiones solicitadas e impagas; no se cierra una asesoría/juicio con gestiones o comité
  pendientes; no se pide nueva entrega de provisión con rendiciones pendientes; las
  búsquedas no precargan datos.
- **Búsquedas (Anexo §XI)**: usar `lm-criterios-busqueda` (`apps/web/src/app/shared`) y no pedir datos
  hasta "Buscar"; en la API, los criterios comunes son `CriteriosBusquedaSchema` (shared) y se aplican
  con `condicionAtencion()` (`common/busqueda/criterios.ts`) junto con `filtroAtenciones()`.
- **Cargas y bienes**: cuelgan de la relación titular–plan (`cargas_afiliado`, `bienes_afiliado`); se
  cargan por `POST /cargas-masivas/:entidad` (FLUJO/STOCK). Una atención para una carga lleva
  `carga_id`, validada en `AtencionesService.crear()` (mismo titular y plan, vigente hoy).
- **Posesión efectiva**: es un tipo de atención (`PosesionEfectiva`, prefijo POSE); causante y
  herederos se manejan solo vía `PosesionesService`. La ficha PDF es un resumen interno, nunca el
  formulario oficial del Registro Civil.
- **Exportaciones y reportes**: XLSX con `libroXlsx()` (`modules/exports/xlsx.ts`, exceljs), nunca CSV;
  tope `MAX_FILAS_EXPORTACION`; las descargas del frontend pasan por `descargarArchivo()`. Las
  fórmulas de reportes viven en `modules/reportes` (`calculo.ts` + `reportes.service.ts`); la tasa de
  uso está pendiente de validar con LegalChile.
- **Sin datos de mockup en el código**: si un valor no existe en la API, mostrar vacío o
  "sin datos", nunca una cifra inventada.
- **RUTs**: siempre normalizar con `formatearRut()` antes de comparar/insertar.
- **Soft-delete**: marcar `vigencia: "Eliminado"` en vez de `DELETE` (Ley 19.628 exige
  trazabilidad).
- **Correlativos**: generar con `siguienteCorrelativo()` — usa UPSERT atómico en
  `correlativos` para evitar duplicados bajo concurrencia.
- **Auditoría**: cualquier mutación importante debe escribir un registro en `auditoria`
  (`AuditInterceptor`, global). El interceptor redacta credenciales (`token`, `secret`, `headers`,
  `password`…) con `redactar()` y no audita `/auth/*` ni health; las exenciones se comparan por ruta
  exacta, nunca con `includes()` sobre la URL (la query string no debe poder activarlas). Lo mismo
  vale para `MaintenanceInterceptor`.
- **Seguridad transversal (auditoría run-1)**: el límite de tasa y las métricas nunca usan cabeceras
  que elige el cliente (`X-Cod-Plan`, primera entrada de `X-Forwarded-For`); la IP sale de `req.ip`
  con `trust proxy = TRUSTED_PROXY_HOPS`. Los secretos (webhooks) se devuelven solo al crear/rotar.
  Las URLs de webhooks se validan (`CrearWebhookSchema`) y el dispatcher solo llama a destinos
  públicos (`asegurarDestinoPublico`), sin seguir redirecciones. Un documento se registra solo con
  la clave emitida para su atención (`claveCorrespondeAAtencion`). Cerrar sesión llama a
  `POST /auth/logout`, que sube `usuarios.sesion_version` e invalida las sesiones anteriores. Nadie
  cambia su propio perfil ni otorga permisos que no tiene. Entra ID exige `ENTRA_AUDIENCE` y
  `ENTRA_ISSUER`. Todo dato de usuario en correos HTML pasa por `escaparHtml()`.
- **Aprobaciones y transiciones (auditoría run-2)**: cuatro ojos en provisiones, aranceles por
  atención y derivaciones: quien solicita (o envía a aprobación) no aprueba ni rechaza. Toda escritura
  de estado es condicional al estado leído (`UPDATE … WHERE estado = <actual>` o `FOR UPDATE`) y
  responde 409 si otro la resolvió antes; un comité solo se cierra una vez y una gestión solo se completa
  desde Pendiente/Vencida (`ESTADOS_GESTION_ABIERTA`). Afiliados: `Eliminado` solo
  lo fija `DELETE` y solo lo revierte `POST /afiliados/:id/restaurar` (ambos `afiliados.eliminar`);
  editar un afiliado eliminado responde 409.
- **Días hábiles y feriados**: todo plazo en días hábiles usa `sumarDiasHabiles()`/`diasHabilesEntre()`
  (`common/utils/dias-habiles.ts`), que saltan fines de semana y la tabla `feriados`. Los legales los calcula
  `feriadosLegales()` (`feriados-chile.ts`) y `FeriadosService` los carga para el año en curso y el siguiente;
  los de decreto o elecciones se agregan en Maestros → Feriados (`maestros.administrar`). Nunca listas fijas.
- **Montos**: enteros (centavos para USD/EUR; pesos chilenos son enteros nativos).
- **Drizzle**: no usar `db.execute(raw)` salvo para casos atómicos (correlativo, upsert
  con xmax). Preferir el query builder tipado.
- **NestJS**: un módulo por bounded context. Sin imports circulares entre módulos
  (exportar servicios cuando se requiera).
- **Tests**: Vitest. Cada servicio con un test happy-path mínimo (pendiente — ver
  TODO en cada módulo).

## TODOs prioritarios

**Seguimiento vigente:** [`docs/plan-cumplimiento-anexo.md`](./docs/plan-cumplimiento-anexo.md) (fases 0–7, con casillas)
y el detalle requisito por requisito en `docs/cumplimiento-anexo-detalle.md`. El orden histórico está en
`docs/requerimientos-anexo-psl.md` §5. Pendientes técnicos:

1. Integración real Transbank WebPay (reemplazar stub en `pagos.service.ts`).
2. Notificaciones por correo de vencimientos y flujos (SES), incluido el resumen de cargas masivas.
3. AWS CDK en `infra/` para Aurora + ECS + ALB + S3 (corregir `apps/api/Dockerfile`, que no copia `pnpm-lock.yaml`).
4. Migración SQL Server 2008 → Aurora (AWS DMS + SCT) — ver plan en `docs/`.
5. Formularios oficiales de posesión efectiva (discovery).
