# NEXUS vs Anexo Definición Requerimiento PSL — detalle por requisito

Revisión de solo lectura del código (rama claude/auto-crm-skill-YuszQ, commit 93a89e1) contra el PDF del Anexo. Estados: Cumple / Parcial / No cumple / Fuera de código.


---

<!-- §I–V -->

## Revisión de cumplimiento del Anexo PSL, líneas 1–455 (§I, II, III, IV y V)

Solo lectura: no modifiqué ningún archivo ni ejecuté nada. Las rutas son relativas a `/home/user/Legalmene`.

Dos hallazgos que corrigen lo que dice la documentación del propio repo:
- **Entra ID no está conectado en el frontend.** `CLAUDE.md` dice "MSAL.js para Entra ID", pero el único ingreso es el enlace por correo (`apps/web/src/app/features/auth/login.component.ts:14`). Las dependencias `@azure/msal-*` están instaladas y no se usan. El backend sí valida tokens de Entra ID.
- **El CDK sí existe.** `CLAUDE.md` lo marca "⏳ Pendiente", pero está en `infra/cdk/src/*`. No se puede comprobar que esté desplegado; el despliegue actual (`render.yaml`) usa plan `free` con `AUTH_DISABLED=true` (líneas 6 y 25).

### I. Antecedentes generales
| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 21-25 | Acceso web desde cualquier lugar; solo usuarios del dominio (cuentas Microsoft) | Parcial | El dominio se valida en `modules/auth/dominio.ts:2`, `jwt-auth.guard.ts:70-74` y `enlaces-acceso.service.ts:56`. El backend acepta Entra ID, pero el frontend no inicia sesión con Microsoft (ver arriba). |
| 26-28 | Sin licencias por usuario ni límites de usuarios o afiliados | Fuera de código | Stack open source (NestJS, Angular, Postgres). No hay límites en el código. |
| 29-31 | Interfaces amigables | Cumple (subjetivo) | Angular 19 + PrimeNG. Menú filtrado por permisos (`apps/web/src/app/app.component.ts:347-349`). |
| 32-36 | Búsquedas sin precarga, con descarga Excel según privilegios | Cumple | `shared/criterios-busqueda.component.ts:25,124`; `GET /exports/busquedas/:tipo.xlsx` con `@Permiso("exportar.datos")` (`exports.controller.ts:34-35`); tope de 50.000 filas (`packages/shared/src/types/busqueda.ts:28`). La API acepta listados sin filtro: la regla vive solo en la pantalla. |
| 37-41 | Modularidad, sin rehacer lo existente | Cumple | Un módulo NestJS por dominio (`apps/api/src/modules/*`); migraciones Drizzle incrementales 0000-0016. |
| 47-50 | Clientes y socios (ZonaClientes, Carro de Compras) con información en línea | Parcial | Solo webhooks de atención (`packages/shared/src/types/webhook.ts:3`). No hay API para ZonaClientes ni Carro de Compras. |
| 51-53 | Alta disponibilidad | Parcial / Fuera de código | CDK con Aurora Multi-AZ y réplicas (`infra/cdk/src/data-stack.ts:33-45`), ECS con 2 tareas mínimas en prod (`compute-stack.ts:70,106`), VPC de 3 zonas (`network-stack.ts:19`). Sin evidencia de despliegue. |
| 54-57 | Carga masiva de afiliados y coberturas, sin errores (duplicados, datos faltantes) | Parcial | Afiliados: valida RUT, duplicados en el archivo y obligatorios (`cargas-masivas.service.ts:110-140`). No hay carga masiva de coberturas. |
| 58-62 | Migración de datos SQL Server → nuevo sistema | No cumple | Solo el plan (DMS + SCT) en `docs/propuesta-arquitectura-legalchile.md:162-198`. No hay scripts. |
| 63-69 | Log de accesos, acciones, procesos y errores | Parcial | Acciones: `AuditInterceptor` global (`app.module.ts:75`). Accesos denegados se registran (`jwt-auth.guard.ts:79+`). Faltan: auditoría de `/auth/*` (`audit.interceptor.ts:35`); registro de canjes de enlace fallidos (`enlaces-acceso.service.ts:105`); ejecución de procesos (solo `Logger`). |
| 65 | Bloqueo tras 3 intentos fallidos + aviso al administrador | No cumple | Se delega a Entra ID Smart Lockout (`jwt-auth.guard.ts:21`), que el frontend no usa. El tope de 3 enlaces cada 15 min (`enlaces-acceso.service.ts:21`) no bloquea la cuenta ni avisa. |
| 66 | Errores de funcionamiento con aviso al administrador | No cumple | El filtro solo escribe en el log (`common/filters/i18n-exception.filter.ts:114-116`). |
| 70-74 | Fuentes, manuales, definición de tablas, capacitación | Parcial / Fuera de código | Hay fuentes, Swagger, `docs/runbook.md`, `docs/handoff-report.md` y el esquema Drizzle. No hay manual de usuario ni de administrador. La capacitación no es verificable en el repo. |
| 75-78 | Posesión efectiva con formularios imprimibles | Parcial | Módulo y ficha PDF interna (`modules/posesiones/posesion-pdf.service.ts:16-17,54`). No hay formularios oficiales del Registro Civil. |
| 79-83 | Coberturas en UF o %; al crear un plan, asignar una cobertura existente o subir una | Parcial | Reglas por plan en % o UF (`coberturas.controller.ts:42-50`). Faltan: carga masiva de coberturas, asignar una cobertura al crear el plan y copiarla de otro plan (`packages/shared/src/types/plan.ts:14`). |

### II. Módulo Administración
| Ref | Requisito | Estado | Evidencia / qué falta |
|---|---|---|---|
| 96-99 | Parámetros del sistema exclusivos del administrador | Cumple | Toda escritura exige `@Permiso` y el perfil ADMIN tiene todos (`packages/shared/src/types/permisos.ts:66-77,101-102`). |
| 106-108 | CRUD de perfiles y accesos | Cumple | `usuarios-admin.controller.ts:74-91`; pantalla Admin › Perfiles. Eliminar un perfil es un `DELETE` físico (`perfiles.service.ts:114`), contra la regla de soft-delete. |
| 106-108 | CRUD de usuarios y cargos | Parcial | Existe editar perfil, jefatura, anexo, activo y bloqueo (`admin-usuarios.component.ts:120-153`). Faltan: crear usuarios (no hay `POST /admin/usuarios`; solo alta automática de Entra ID, `usuarios.service.ts:280`) y el campo "cargo". |
| 108 | Registro y habilitación de sesiones bloqueadas | Parcial | Bloquear y desbloquear manualmente: `usuarios.service.ts:261`. No hay bloqueo automático. |
| 110-111 | Usuarios desactivados fuera de las listas, pero visibles en históricos | Cumple | `usuarios.service.ts:316-321` (`opciones()` solo devuelve activos y no bloqueados). |
| 118-120 | Planes: alta, término de vigencia, precios, coberturas, coberturas complementarias, subir coberturas | Parcial | El API tiene `POST`/`PATCH /planes` (`planes.controller.ts:25-32`), pero **no hay pantalla de planes**. La vigencia es solo un booleano (no hay fecha de término). Precios: pantalla de aranceles. No hay coberturas complementarias ni carga de coberturas. |
| 120-121 | Búsqueda de coberturas de planes vigentes, solo lectura | Parcial | `admin-coberturas.component.ts:161` es solo lectura sin `coberturas.administrar`, pero la lista de planes incluye los no vigentes (línea 164). |
| 121-123 | Plan no vigente: fuera de la lista del RUT, sin atenciones, fuera de búsquedas | Parcial | La API bloquea la atención (`atenciones.service.ts:208-225`). Pero el formulario muestra el plan no vigente deshabilitado (`atencion-form.component.ts:310-312`) y los selectores de búsqueda y cobertura listan todos los planes. |
| 131-134 | Afiliados: cargar, eliminar, actualizar; edición o solo lectura según perfil; alta individual | Parcial | El API está completo (`afiliados.controller.ts:66-97`), pero la web es solo lectura: `afiliados-list` y `afiliado-detail` no permiten crear, editar ni eliminar. |
| 141 | Carga masiva de Afiliados, Atenciones, Bienes y Cargas | Parcial | Afiliados, cargas y bienes: sí (`cargas-masivas.controller.ts:45-73`). **Atenciones: no.** |
| 148-151 | Maestros: competencias, materias, gestiones por materia, tipos de consulta, causas de término, calidad procesal, procedimientos, tribunales, organismos | Cumple | `maestros.service.ts:41-70`; gestiones por materia en `plantillas.controller.ts:36-43`. |
| 150-151 | Tipos de acciones, regiones, ciudades, comunas, canales, horarios por perfil | No cumple | Tipo de gestión es un enum fijo (`packages/shared/src/types/gestion.ts:3`). Región y comuna son texto libre y **no existe el campo ciudad** (`db/schema/afiliados.ts:33-34`). Canales solo tiene `GET` (`canales.controller.ts:16`). No hay horarios. |
| 156-158 | Herramientas del administrador para corregir registros y retroceder flujos (p. ej. reiniciar derivaciones) | No cumple | No hay ninguna herramienta de retroceso ni reapertura. |
| 158-160 | Administrar módulos y permisos de visualización por perfil o cargo | Cumple (perfil) / No cumple (cargo) | Permisos por módulo y acción (`permisos.ts:5-78`). |

### III. Carga masiva
| Ref | Requisito | Estado | Evidencia / qué falta |
|---|---|---|---|
| 175-184 | Tres cargas: afiliados, cargas y bienes por relación RUT–Plan | Cumple | `cargas-masivas.service.ts:63,270,366`. |
| 192-193, 224-226 | Formato "SGC-RG-OP-004" con los 5 primeros campos obligatorios | Parcial (verificar) | Se acepta CSV con columnas propias; solo `rut`, `nombres` y `apellido_paterno` son obligatorios y `fecha_inicio` toma hoy por defecto (`:110-157`). No se sabe si el formato oficial es xlsx ni cuáles son sus 5 primeros campos. |
| 199-205, 210-214 | Modalidades Flujo y Stock | Cumple | `tipo=FLUJO|STOCK` (`cargas-masivas.controller.ts:67`). |
| 236-239 | RUT nuevo: se registra con Rut, Nombre, Dirección, Correo, Fono, Región, Ciudad, Comuna; si existe, no se actualiza | Parcial | `onConflictDoNothing` cumple la regla (`:168-171`), pero **falta Ciudad** en el modelo. |
| 242-245 | Relación Plan–RUT: crear o actualizar FechaTermino | Cumple | `:176-198`. |
| 293-296 | Stock: los ausentes reciben FechaTermino = hoy y Vigencia "Eliminado" | Cumple, con riesgo | `:203-216`. Riesgo: un RUT que viene en el archivo pero con error de validación queda fuera de los válidos y Stock lo da de baja. |
| 308-312 | Resumen con planes, RUT con error (xlsx/txt), RUT nuevos y eliminados, enviado por correo a operaciones@ | Parcial | XLSX con conteos y errores (`:476-505`) y aviso en la aplicación (`:450-472`). Faltan: **correo** a operaciones@, listas de RUT nuevos y eliminados (hoy solo conteos) y columna RUT en errores. |
| 213, 257 | "Aplicación instalada en pc" | Fuera de código | Es opcional ("o"); basta la web. |

### IV. Perfiles de usuario
| Ref | Requisito | Estado | Evidencia / qué falta |
|---|---|---|---|
| 325 | Validar dominio LegalChile al ingresar | Cumple | `dominio.ts:2`; `enlaces-acceso.service.ts:56`. |
| 326-333 | Usuario, contraseña y anexo telefónico al ingresar | Parcial (desvío) | Ingreso sin contraseña por enlace. El anexo lo fija el administrador por usuario (`db/schema/usuarios.ts:56`); no se pide al ingresar ni se usa para buscar grabaciones. |
| 335-336 | Opciones habilitadas según el usuario | Cumple | `app.component.ts:349`; `permisoGuard` en `app.routes.ts`. |
| 338-340, 424-428 | Admin crea perfiles y define accesos (módulos y lógica); crea usuarios | Parcial | Perfiles: sí. Crear usuarios: no (ver §II). |
| 347-351 | Admin con acceso total, más un nivel con menos privilegios | Cumple | ADMIN tiene todos los permisos (`permisos.ts:102`); se pueden crear perfiles reducidos (`CreatePerfilSchema`, `copiarDe`). |
| 358-362 | Jefaturas: informes, atenciones, agendas; aprobar aranceles, provisiones y derivaciones de su equipo | Parcial | Permisos en `permisos.ts:134-147`; alcance "equipo" en `common/acceso/alcance.ts:25-27` (solo reportes directos). **No hay agenda.** |
| 369-374 | Abogado: varios usuarios, ve solo sus atenciones, agenda, relación con su jefatura | Parcial | Alcance propio en `alcance.ts:20-24`; jefatura en `usuarios.ts:54`. **Agenda y citas: no cumple.** |
| 382-385 | Tramitador: edita gestiones de asesorías y juicios; notas para el abogado | Parcial | Tiene `gestiones.registrar` y `atenciones.editar` (`permisos.ts:180-198`), pero solo ve lo que creó o donde tiene una gestión (`alcance.ts:20-24`), no todas las asesorías y juicios. No hay notas para el abogado. |
| 387-388 | Tramitador crea atenciones y las asigna al abogado, con correo | Parcial | El API acepta `abogadoAsignadoId` y avisa en la aplicación (`atenciones.service.ts:296-305`). Faltan: **correo** y selector de abogado en el formulario web. |
| 395-404 | Contador y Asistente Contable: provisiones, aranceles, compra de planes web | Parcial | Provisiones y aranceles: sí (`permisos.ts:149-157`). Compra de planes web: no (WebPay es un stub ligado a afiliado y atención). |
| 411-412 | Comercial: reportes, vigencias y atenciones por RUT | Cumple | `permisos.ts:207-212`. |
| 419-420 | Administrativo: vigencias y atenciones por RUT | Cumple | `permisos.ts:213`. |

### V. Atenciones
| Ref | Requisito | Estado | Evidencia / qué falta |
|---|---|---|---|
| 439-441 | Ver e ingresar atenciones y gestiones, con seguridad según el usuario | Cumple | `atenciones.controller.ts:38-114` con `@Permiso`; `filtroAtenciones()` en `alcance.ts:14`. |
| 441-443 | Buscar por correlativo, RUT, plan, abogado o fecha | Cumple | `packages/shared/src/types/busqueda.ts:8-20`; `common/busqueda/criterios.ts:28-38`. |
| 450 | Ver, modificar y agregar atenciones | Cumple | `POST` consultas, asesorías y juicios; `PATCH /atenciones/:id` (`atenciones.controller.ts:48-67`). |

### Brechas más importantes
1. **El acceso no cumple lo pedido:** el frontend no usa Entra ID, no hay bloqueo tras 3 intentos con aviso al administrador, tampoco aviso de errores, y el despliegue actual corre con `AUTH_DISABLED=true`.
2. **Faltan altas por pantalla:** no se pueden crear usuarios (ni existe "cargo"), no hay pantalla de planes, y en la web los afiliados son solo lectura.
3. **Carga masiva incompleta:** no envía correo a operaciones@, falta Ciudad, faltan carga de atenciones y de coberturas, el resumen no lista los RUT nuevos ni eliminados, y Stock puede dar de baja RUT que venían en el archivo con error.
4. **Funciones de perfil ausentes:** no hay agenda ni citas para abogados y jefaturas, ni correo al asignar, ni notas para el abogado, ni compra de planes web; tampoco herramientas de retroceso de flujos.
5. **Maestros y no funcionales pendientes:** faltan regiones, ciudades, comunas, tipos de acción, canales editables y horarios; la migración SQL Server no tiene scripts, la alta disponibilidad no está desplegada y no hay manuales de usuario.


---

<!-- §VI–VII -->

## Revisión de cumplimiento del Anexo PSL, líneas 456–957 (§VI Consultas y §VII Asesorías)

Revisé solo leyendo el código; no modifiqué nada ni ejecuté builds o tests. Las rutas son relativas a `/home/user/Legalmene`.

### VI. CONSULTAS

| Ref (línea del anexo) | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 466–469 | Participantes: JC (dueño del proceso), AR, cliente | Cumple | Perfiles `JEFATURA_CONSULTAS` y `ABOGADO` en `packages/shared/src/types/permisos.ts:177-178`; la jefatura tiene `derivaciones.aprobar` (`:138`) |
| 483–485 | Solicitud por teléfono, cita, web u otro medio | Parcial | Se registra el canal. No hay integración con www.legalchile.cl ni bandeja de entrada web |
| 493–496 | Tipos de contacto: Telefónico, Entrevista, E-Mail, Chat, Video | Cumple | `CanalContactoEnum` en `packages/shared/src/types/atencion.ts:7`; selector en `apps/web/.../atencion-form.component.ts:129-131` |
| 503 | AR entra con credenciales y anexo; botón "Consulta / Nueva Consulta" | Parcial | Login propio y Entra ID existen. Hay campo `usuarios.anexo` (`apps/api/src/db/schema/usuarios.ts:56`), pero el anexo no se pide ni se usa al iniciar sesión. La consulta se crea en un formulario genérico de "Nueva atención" |
| 504–505 | Ingreso por RUT; RUT menor a 10 millones con 0 a la izquierda | Parcial | La API normaliza con `formatearRut`. El formulario no tiene campo RUT: muestra un desplegable de afiliados precargado (`pageSize: 200`, `atencion-form.component.ts:47-57,266`). Eso tampoco cumple la regla "sin precarga" |
| 514–516 | Mostrar datos del afiliado y sus planes con estado de vigencia | Cumple | `cargarPlanes()` muestra los planes con "(no vigente)" (`atencion-form.component.ts:301-324`) |
| 518–520 | Seleccionar el plan: prioridad a los vigentes y, entre ellos, al de mayor cobertura | Parcial | Solo se pueden elegir planes vigentes. La preselección es `vigentes[0]` (`:321`), sin ordenar por cobertura |
| 521 | Campos Competencia, Materia y Tipo de Consulta | Cumple | Maestros vigentes (`atencion-form.component.ts:83-135`); la API valida con `validarMateria` (`atenciones.service.ts:196-206`) |
| 521–523 | Fecha y hora puestas automáticamente al iniciar | Cumple | `horaInicio: new Date()` al crear (`atenciones.service.ts:277`); `horaTermino` al pasar a Respondida o Terminada (`:398-401`) |
| 524–527 | RUT sin planes → Rezagado o MetLife | Cumple | `validarPlanDeAtencion` (`atenciones.service.ts:210-232`); en la web, `PLANES_SIN_COBERTURA` (`atencion-form.component.ts:314-318`) |
| 524 | RUT no registrado como cliente → Rezagado o MetLife | Parcial (verificar) | El flujo exige un `afiliadoId` existente. Para un RUT inexistente hay que crear antes el afiliado; no hay alta rápida desde la consulta |
| 537–541 | Enviar al cliente por correo el "Formulario de Antecedentes Requeridos" y el cuestionario de divorcio | No cumple | No hay plantillas de formulario ni envío de correo al cliente (no hay coincidencias en el código) |
| 541–544 | Bifurcación: requiere o no documentos (3.3 / 3.4) | Parcial | No existe un estado o marca "espera de documentos" para consultas: el mapa CONSULTA es Iniciada → Respondida → Terminada (`estados-atencion.ts:50-55`) |
| 553 | AR escribe la respuesta en el campo Nota | Cumple | Campo `respuesta` (`atencion.ts:40`); textarea "Respuesta al afiliado (nota)" (`atencion-flujo.component.ts:114-117`) |
| 554–556 | Informar aranceles de asesoría o juicio, provisiones estimadas y formas de pago | Parcial | El formulario muestra un copago estimado para la materia y el plan (`atencion-form.component.ts:112-118`). No muestra estimación de provisiones ni formas de pago |
| 557–560 | AR consulta a JC si hay dudas | Fuera de código | Es una práctica operativa. No hay acción "consultar a jefatura" |
| 567–570 | El cliente envía documentos por correo; AR los sube en PDF al sub-módulo "Archivo" | Parcial | La API de documentos existe (S3 con URL firmada, `documentos.service.ts:53-100`) y la web la lista y descarga. El botón "Subir documento" de la ficha no tiene manejador (`atencion-detail.component.ts:374`) y `DocumentosApiService.upload()` no se usa en ninguna vista. No se exige PDF (no se valida el tipo de archivo) |
| 580–583 | Respuesta por correo, que se sube como PDF | Parcial | Misma situación de subida. No hay envío de correo al cliente desde el sistema |
| 583–584 | Llamada de validación grabada como "Mantención de Audio" | No cumple | No existe ese tipo de registro o grabación |
| 595–597 | Preguntar si quedan dudas antes de cortar | Fuera de código | Operativo |
| 604–609 | Botón "Nuevo Correlativo": cambiar competencia y materia y generar otro correlativo, repetible, con nota por consulta | Parcial | En la API cumple: `nuevoCorrelativo` acepta competencia, materia, tipo y respuesta y hereda canal y grabación (`atenciones.service.ts:412-433`; `atencion.ts:119-125`). En la web solo pide el asunto y reutiliza la misma competencia y materia (`atencion-flujo.component.ts:360-369`) |
| 619–623 | "Obtener Grabación": listar las grabaciones del día del anexo y seleccionar la pista | No cumple | Solo hay un campo de texto libre `codigoGrabacion` (`atencion.ts:37`; `atencion-flujo.component.ts:106-107`). No hay integración con la central telefónica (pendiente reconocido en `docs/requerimientos-anexo-psl.md:88`) |
| 632–634 | "Guardar" muestra el correlativo de la atención | Cumple | Correlativo con `siguienteCorrelativo` (`atenciones.service.ts:267`); aviso con el correlativo (`atencion-form.component.ts:366`) |
| 643–644 | AR decide si solicita derivación según los beneficios del plan | Parcial | El botón de derivar existe, pero no se valida que el plan dé derecho a asesoría o juicio. Hoy la decisión queda solo en el criterio del abogado |
| 651–654 | Botón "Solicita Derivación"; ejecuta AR, responde JC | Cumple | `DerivacionesService.solicitar` (`derivaciones.service.ts:85-102`); aprobar o rechazar con `derivaciones.aprobar` y regla de cuatro ojos (`:113-216`); botones en `atencion-flujo.component.ts:119-122` |
| 662–665 | Entrevista o videollamada: AR ve en agenda día y hora y luego registra | Parcial | Se puede registrar la atención con canal Presencial o Videoconferencia. No hay agenda ni reserva de horas |
| 667, 678 | JC queda informado de las entrevistas y de los e-mail o chat | No cumple | No se notifica a la jefatura al crear consultas (`notif` solo va al abogado asignado, `atenciones.service.ts:296-306`) |
| 674–676 | E-mail o chat: adjuntar la consulta y la respuesta en "Archivos" | Parcial | Mismo problema de subida en la web que en la fila 567–570 |
| 685–689 | Requiere documentos y formulario de antecedentes (canales no telefónicos) | No cumple | Igual que la fila 537–541 |
| 694–696 | Registrar códigos de grabación en todos los módulos | Parcial | Solo en consultas: `limpiarPorTipo` borra `codigoGrabacion` en asesorías y juicios (`atenciones.service.ts:61,250-255`) |

### VII. ASESORÍAS

| Ref (línea del anexo) | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 710–712 | Aplica a casa central, sedes regionales y red nacional | Parcial (verificar) | No hay atributo de sede o red en usuarios ni en atenciones. El alcance funciona por jefatura (`jefeId`) |
| 721–722 | Al terminar la derivación se crea la asesoría, automática o manualmente | Cumple | Automática: `DerivacionesService.aprobar` crea la asesoría en estado Asignada (`derivaciones.service.ts:141-156`). Manual: `POST atenciones/asesorias` (`atenciones.controller.ts:54-58`) |
| 729–731, 742–743 | Revisar cobertura y % de copago con el botón "Ver Plan" junto al RUT | Parcial | El copago se calcula con `calcularCopago()` y se muestra en la ficha (`atencion-detail.component.ts:169-182`). El enlace "Ver coberturas del plan" lleva a `/admin/coberturas` (`:125`), una pantalla de administración. No hay un detalle de plan de solo lectura para el abogado junto al RUT |
| 750 | Sin cobertura, GS puede autorizar la atención | No cumple | No hay flujo de autorización o excepción por Gerencia de Servicios. El flujo de arancel Requerido → EnAprobación → Aprobado → Pagado aprueba el cobro, no una excepción de cobertura (`aranceles-atencion.service.ts:144-172`) |
| 757–759 | Sin autorización → estado "Abandonada" con "Fecha de Término" | Parcial | En la API cumple: Abandonada existe (`estados-atencion.ts:58-66`), exige causa de término (`estados.ts:82-87`) y acepta `fechaTermino` (`atenciones.service.ts:397`; `CambiarEstadoSchema`). La web no envía `fechaTermino`, así que siempre queda la fecha de hoy (`atencion-flujo.component.ts:323-338`) |
| 765–767, 774–777 | AR se presenta al cliente por correo dentro de 24 h hábiles desde la asignación | No cumple | No hay correo al cliente ni control del plazo de 24 h hábiles. Solo se notifica al abogado en la bandeja interna (`derivaciones.service.ts:182-192`) |
| 767–770 | Pedir antecedentes, informar montos y el plazo de los primeros avances | Parcial | Existe el estado `EnEsperaAntecedentes`. No hay registro del "plazo de primeros avances" ni comunicación al cliente |
| 772–774 | Si hay copago, informar el procedimiento y pedir comprobante | Parcial | Se puede asociar un comprobante al registrar el pago (`comprobanteDocumentoId`, `aranceles-atencion.service.ts:169`). No hay aviso al cliente |
| 789–790 | El copago depende de la cobertura del plan | Cumple | `crearParaAtencion` guarda una foto de la cobertura y deja el arancel en Requerido o NoRequerido (`aranceles-atencion.service.ts:34-60`) |
| 797–799 | Con arancel impago la atención queda detenida; solo con el flujo de arancel terminado se avanza | Parcial | `bloqueo()` impide pasar a los estados de trabajo y a Terminada (`estados.ts:37-48,65`; `atenciones.service.ts:369`). Pero `GestionesService.crear/completar` no revisa el arancel (`gestiones.service.ts:95-153`) y las gestiones predefinidas se crean al abrir el caso (`atenciones.service.ts:284-292`). El caso queda en Asignada, pero se puede trabajar |
| 806–807 | La provisión depende de la competencia y la materia | Parcial | Las provisiones existen por atención (módulo `provisiones`), pero no hay regla que exija provisión según la materia |
| 814–816 | La atención queda detenida hasta el depósito de la provisión | Parcial | `EnEsperaProvision` existe, pero se pone a mano. No hay bloqueo automático ligado a provisiones solicitadas o impagas. Al terminar, sí se exigen provisiones cerradas (`estados.ts:80`; `provision.ts:48-55`) |
| 823–826 | AR verifica la información y pide lo que falta | Parcial | Estado `EnEsperaAntecedentes` manual. No hay comunicación al cliente |
| 838–839 | Subir documentación esencial a "Archivos" en PDF | Parcial | El backend y S3 están listos. En la web no se puede subir (botón sin acción, `atencion-detail.component.ts:374`) y no se exige PDF |
| 850–851 | Pedir la información faltante en menos de 24 h | No cumple | No hay plazo, alerta ni registro de cuándo se detectó la falta |
| 858–860 | Gestiones predefinidas por materia | Cumple | `PlantillasService.instanciar` con plazo en días hábiles (`plantillas.service.ts:56-100`), que se llama al crear el caso |
| 860–862 | Inicio de gestión: fecha de inicio, responsable (AR o Tramitador) y comentario | Parcial | En la API: `fechaProgramada`, `responsableId` y `detalle` (`gestion.ts:24-36`); existe el perfil TRAMITADOR. En la web solo se pide el título, con tipo fijo `LlamadaTelefonica` y responsable fijo (`atencion-detail.component.ts:640-656`) |
| 862–863 | Término: AR completa el campo fecha de término | Parcial | `completar` pone `fechaEjecucion = new Date()` (`gestiones.service.ts:141`), así que no se puede ingresar la fecha real. La ficha no tiene botón para completar; solo existe en `gestiones-global.component.ts:116,186` |
| 863–864 | Inicio y término informados al cliente por correo | No cumple | Solo hay notificación interna al responsable (`gestiones.service.ts:119-129`) |
| 866–867 | Si no hay gestiones, AR pide a AJA que las defina | Parcial | Hay mantenedor de plantillas (`plantillas.controller.ts`), pero no hay flujo de solicitud a AJA |
| 876–878 | Tras terminar una gestión, decidir si hay nuevas o pasar a la etapa 07 | Parcial | Se pueden crear más gestiones. No es un paso guiado |
| 888–890 | Comité: AJA y AR revisan avances y registran instrucciones de AJA | Parcial | El módulo existe con motivo, votos y acta (`comites.service.ts:22-121`; `comite.ts`). Está pensado para votación, no como bitácora de instrucciones. El perfil ABOGADO no tiene `comites.convocar` (`permisos.ts:117-131`) |
| 891–893 | Al término, AJA revisa la carpeta y coteja que no quede saldo de provisión por devolver | Parcial | Terminar exige provisiones sin abrir, y rendir exige saldo 0 (`provisiones.service.ts:282-284`). No hay paso de revisión de AJA |
| 904–906 | V°B° de jefatura antes de "Terminado" | No cumple | El perfil ABOGADO tiene `atenciones.cambiar_estado` y puede terminar sin aprobación. No hay paso de V°B° ni estado de "pendiente de visto bueno" |
| 905 | No se cierra con gestiones o comité pendientes | Cumple | `validarTransicion` revisa gestiones pendientes, comité abierto, provisiones abiertas y causa de término (`estados.ts:76-81`; `atenciones.service.ts:356-388`) |
| 915–917 | Informe final al cliente con documentos y rendición de gastos | Parcial | Existe una ficha PDF interna (`exports/atencion-pdf.service.ts`). No hay informe final al cliente ni envío, y la rendición de gastos no va incluida (verificar) |
| 928–929 | Fin: estado "Terminado" con documentos y registros | Cumple | Estado Terminada; `cerrarProvisionesDeAtencion` al terminar (`atenciones.service.ts:406`) |
| 937–939 | AR comunica, registra gestiones y sube documentos | Parcial | Registrar gestiones: sí. Subir documentos desde la web: no está conectado. Comunicación con el cliente: no existe |
| 941–942 | AJA revisa y valida la atención de AR | Parcial | Las jefaturas ven a su equipo (`atenciones.ver_equipo`). No hay validación formal |
| 947–949 | Códigos de grabación en todos los módulos | No cumple | No hay `codigoGrabacion` en asesorías (`atenciones.service.ts:61,250-255`) |
| 951–952 | Submódulo Comité como bitácora y control de compromisos de AR o AJA | Parcial | No hay entradas de bitácora con compromiso, plazo y responsable dentro del comité. Solo motivo y acta |

**Observación aparte (fuera del alcance funcional):** `cambiarEstado` escribe el estado sin la condición `WHERE estado = <actual>` (`atenciones.service.ts:405`). Lo mismo pasa al marcar la consulta como Derivada (`derivaciones.service.ts:171-179`). Eso va contra la regla de CLAUDE.md sobre escrituras de estado condicionales (auditoría run-2).

### Brechas más importantes
1. **Sin comunicaciones al cliente:** no hay correos de presentación (≤24 h hábiles), formulario de antecedentes, aviso de inicio y término de gestiones ni informe final. Solo existen notificaciones internas.
2. **La subida de documentos no está conectada en la web:** el botón de la ficha no hace nada y no se exige PDF, aunque el backend S3 está listo. Eso bloquea §VI 3.4, 5 y §VII 04.
3. **Telefonía:** no hay "Obtener Grabación" por anexo (solo un texto libre), no hay "Mantención de Audio" y el código de grabación no existe en asesorías.
4. **Controles de flujo incompletos:** no hay autorización de GS sin cobertura, no hay V°B° de jefatura antes de Terminada, el arancel impago no impide registrar ni completar gestiones, la provisión no detiene la atención automáticamente y no hay control de plazos de 24 h.
5. **Formularios web por debajo de lo que permite la API:**
   - Se busca al afiliado en un desplegable precargado, no ingresando el RUT.
   - El plan no se elige por mayor cobertura.
   - "Nuevo correlativo" no deja cambiar competencia ni materia.
   - La gestión no pide fecha de inicio ni responsable, y no se puede ingresar su fecha de término.
   - No se envía la fecha de término al abandonar.
   - El comité no funciona como bitácora de instrucciones.

---

<!-- §VIII–IX -->

## Revisión de cumplimiento: Anexo PSL, líneas 958–1476 (§VIII Juicios y §IX Flujo Aranceles)

Leí las 519 líneas del alcance y contrasté cada requisito con el código actual. Fue solo lectura: no modifiqué archivos ni ejecuté nada.

### VIII. JUICIOS

| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 979-980 | Juicio se crea manual o al aprobar la derivación, en estado "Asignado" | Cumple | `packages/shared/src/types/estados-atencion.ts:90` (`ESTADO_INICIAL`); `apps/api/src/modules/atenciones/derivaciones.service.ts:139-156`; `atenciones.controller.ts:60-63` |
| 980-981 | Avisar por **correo** al abogado designado | Parcial | Solo aviso en la aplicación (`atenciones.service.ts:296-305`, `derivaciones.service.ts:182-191`). `NotifInboxService.crear` no envía correo. |
| 982-983 | AR ingresa competencia, materia y procedimiento | Parcial | Competencia y materia son obligatorias al crear (`atenciones.service.ts:264`). El procedimiento es opcional y nada lo exige antes de enviar el arancel ni de pasar a Pendiente (`estados.ts:71-75`). |
| 983-984 | AR revisa el arancel y lo envía a AJJ | Cumple | `POST atenciones/:id/arancel/enviar` (`aranceles-atencion.controller.ts:45-49`) |
| 984-987 | Contacto con el cliente en ≤24 h hábiles, con registro en el correlativo | No cumple | No hay plazo, alerta ni campo de "primer contacto". |
| 993-998 | Reunión agendada; constancia con código de grabación o correo | Parcial | Se pueden subir documentos por atención (`db/schema/documentos.ts:18`). En asesorías y juicios el `codigoGrabacion` se descarta, porque solo existe para consultas (`atenciones.service.ts:61` + `limpiarPorTipo`). No hay agenda. |
| 1009-1014 | Acta de acuerdo AR–cliente cuando aplique | Parcial | Solo como documento genérico; no hay tipo ni plantilla de acta. |
| 1025-1027, 1034-1036 | Copago según cobertura; AR no patrocina hasta que el arancel esté liberado | Cumple | `copago.ts` (`calcularCopago`); el estado del arancel se crea con la atención (`atenciones.service.ts:283`); bloqueo en `estados.ts:65` + `ESTADOS_ARANCEL_BLOQUEANTES` (`arancel-atencion.ts:36`) |
| 1036-1037 | AJJ aprueba el arancel y el sistema **informa a Finanzas** | Parcial | Aprobación con cuatro ojos: `aranceles-atencion.service.ts:129-147`. No avisa a Finanzas por ningún medio (ni correo ni aviso en la aplicación). La bandeja `/finanzas` lista los aprobados (`finanzas.component.ts:41-66`). |
| 1037-1038 | Registrado el pago, el sistema **informa al abogado** | No cumple | `registrarPago` (`aranceles-atencion.service.ts:156-172`) no avisa a nadie. |
| 1039-1045 | Con plazo corriendo, AR aperciba al cliente y deja constancia | Parcial | Constancia solo como documento o gestión manual; no hay acción específica. |
| 1054-1055, 1062-1065 | Provisión según competencia/materia; AR ingresa montos "indicando la gestión a realizar" | Parcial | `provisiones.service.ts:166-181` guarda monto y `motivo` libre. No se liga a una gestión ni se sugiere por competencia o materia. |
| 1065-1067 | AJJ aprueba la provisión ingresada y se notifica a Finanzas | Parcial | La solicitud inicial pasa de Solicitada a Pagada sin aprobación de AJJ (`provision.ts` `TRANSICIONES_PROVISION`). La aprobación de jefatura está en la **entrega** (`autorizar`, `provisiones.service.ts:236-245`). Los avisos van solo al solicitante (`notificar`, `:403-423`), no a Finanzas. |
| 1076-1078 | Iniciar la tramitación solo con arancel **y provisión** regularizados | Parcial | El arancel bloquea (`estados.ts:65`); la provisión impaga no bloquea el paso a Pendiente o EnGestion. Existe el estado `EnEsperaProvision`, pero es manual. |
| 1085-1089 | Abandono con riesgo ≥20: AJJ marca "Revisado por Comité" | Cumple | `estados.ts:82-87`; `UMBRAL_RIESGO_COMITE=20` (`atencion.ts:85`). Marcar exige el permiso `atenciones.revisar_comite` (`atenciones.service.ts:312`, `atencion-flujo.component.ts:182,248`). |
| 1096-1098 | Abandonado con fecha y razón de término | Parcial | La causa de término es obligatoria (`estados.ts:83`). La API acepta `fechaTermino` (`atenciones.service.ts:397`), pero la pantalla no la envía (`atencion-flujo.component.ts:323-329`) y queda la fecha de hoy. |
| 1105 | AJJ revisa la primera presentación del juicio | No cumple | No hay visto bueno de la primera presentación. |
| 1106-1107 | Presentación sin plazo legal: ≤5 días hábiles desde el pago del arancel | No cumple | No se calcula ni se alerta. El dashboard solo mira escritos que vencen en 5 días hábiles (`dashboard.service.ts:59`). |
| 1108-1109 | Asignado → Pendiente al iniciar; exige tribunal, causa y cuantía | Cumple | `estados.ts:71-75`; transiciones en `estados-atencion.ts:57-66` |
| 1109-1110 | Escritos presentados en PDF en el módulo "Archivos" | Parcial | Hay documentos por atención en S3. No se distingue "documento recibido por tribunal" (sin categoría en `schema/documentos.ts:13-30`). |
| 1121-1122 | Gestiones predefinidas por procedimiento | Cumple | Plantillas por materia o procedimiento (`plantillas.service.ts`), que se instancian al crear y al definir el procedimiento (`atenciones.service.ts:284-292, 333-344`) |
| 1122-1125 | Registrar el inicio (fecha + observación) y el término (fecha de término) de cada gestión | Parcial | Existen `fechaProgramada`/`detalle` y `completar()` (`gestiones.service.ts:133-155`). La fecha de término la pone el sistema con la hora actual; `CompletarGestionSchema` no la acepta. |
| 1125-1126 | Informar al cliente por correo el inicio y el término de cada gestión | No cumple | No se envía ningún correo al cliente. |
| 1128 | Ingresar recursos e incidentes | Fuera de alcance | Lo excluye la línea 1258; correctamente no implementado. |
| 1129-1130 | Correo a AR el día anterior al vencimiento de una gestión con plazo | Cumple | `vencimientos.scheduler.ts:24-78`: correo y aviso en la aplicación 24 h antes. Los plazos no consideran feriados (TODO). |
| 1130-1132 | Audiencias y comparendos en agenda; avisar al Jefe de Procuradores para el calendario mensual | No cumple | Solo existe el tipo de gestión "Audiencia" (`schema/gestiones.ts:23`). No hay agenda, calendario ni aviso. |
| 1142-1144 | Comité: tareas con fecha de cumplimiento; validación en el comité siguiente | No cumple | El comité es una votación (`schema/comites.ts`, `comites.service.ts:22-122`), sin bitácora de tareas, fecha comprometida ni validación de cumplimiento. |
| 1153-1157 | Mantener informado al cliente, con constancia en "Archivos" o código de grabación | Parcial | Solo documentos; no hay código de grabación en juicios. |
| 1168-1171 | Al terminar una gestión, decidir si hay nuevas (volver a etapa 04) | Cumple (implícito) | Se pueden crear gestiones en cualquier momento. |
| 1178-1180 | Informar término y resultado al cliente; rendición de gastos para su aprobación | Parcial | Hay rendición de provisiones (`provisiones.service.ts:280-288`). No hay aprobación de la rendición por el cliente ni aviso del término. |
| 1192-1195 | V°B° de AJJ: sin gestiones pendientes y saldos de provisión devueltos | Cumple | `estados.ts:76-81`: gestiones Pendiente/Vencida, comité abierto y provisiones abiertas impiden Terminada. La revisión de la entrega de documentos al cliente es manual. |
| 1196-1198 | AJJ marca "Revisado por Comité" en la pestaña General para sacar el caso de comité | Parcial | La casilla existe, pero no está ligada al estado `EnComite` ni al cierre del comité (`comites.service.ts:96-121` no la toca). |
| 1209-1210 | Información incompleta: volver a etapa 04 | Cumple (implícito) | Hay transiciones de vuelta a Pendiente/EnGestion. |
| 1217-1219 | Terminado (riesgo ≥20 solo tras comité) con fecha y causa de término | Parcial | La causa es obligatoria (`estados.ts:77`). **No se exige "Revisado por comité" con riesgo ≥20 al terminar**, solo al abandonar (`estados.ts:82-87`). La fecha de término no se pide en la pantalla. |
| 1230-1231 | Fin: cuentas de provisión cerradas | Cumple | `cerrarProvisionesDeAtencion` (`provisiones.service.ts:447-458`), llamada en `atenciones.service.ts:406` |
| 1239-1245 | Roles AJJ y AR | Cumple | Los roles se modelan como permisos (`permisos.ts:16,44-46`). |
| 1251-1253 | Códigos de grabación en **todos** los módulos | Parcial | Solo en consultas; en asesorías y juicios se eliminan (`atenciones.service.ts:61`). |
| 1255-1256 | Submódulo "Comité" como bitácora de gestiones comprometidas por AR/AJJ | No cumple | Igual que 1142. |
| 1258 | No incluir Recursos/Incidentes | Cumple | No existe ese módulo. |
| 1260-1261 | Riesgo = materia + cuantía + cliente | Cumple | `atencion.ts:84-87`; pantalla en `atencion-flujo.component.ts:173-180`. Cada factor va de 0 a 10; la escala no la define el Anexo (validar). |

### IX. FLUJO ARANCELES

| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 1279-1288 | Roles AR, AJ, EC y GAF | Cumple | Permisos `aranceles_atencion.enviar/aprobar/registrar_pago` y `finanzas.ver` (`permisos.ts:44-46`) |
| 1303-1307 | El sistema indica el copago según plan, competencia y materia; botón "Arancel" rojo | Cumple | `copago.ts`, `aranceles-atencion.service.ts:34-61`; colores en `ESTADO_ARANCEL_COLOR` (`arancel-atencion.ts:26-33`); se muestran en `atencion-detail.component.ts:185-189` |
| 1314-1316 | Mostrar el monto "a pagar"; pago en casa central o WebPay | Parcial | El monto en UF y CLP se ve en la ficha (`atencion-detail.component.ts:180-181`). WebPay es un stub (`pagos.service.ts:39-44, 72-93`) y no está ligado al arancel. |
| 1318-1319 | AR recuerda montos y plazos al cliente | Fuera de código | Gestión operativa; no hay plazo de pago modelado. |
| 1336-1339 | Si el cliente no paga: Abandonada con fecha y causa de término | Parcial | `estados.ts:82-84`, permitido desde cualquier estado de arancel. La fecha de término no se pide en la pantalla. |
| 1348-1350 | "Enviar Arancel": correo a AJ y botón naranjo | Parcial | La transición a EnAprobacion (naranjo) existe (`aranceles-atencion.service.ts:125-127`), pero **no se envía correo** a AJ. |
| 1352-1353, 1367-1368 | "Notificar Pago": correo al cliente con el link de pago WebPay | No cumple | No existe la acción ni el correo. |
| 1355-1356 | El camino elegido se puede cambiar en cualquier estado salvo Pagado | No cumple | `TRANSICIONES_ARANCEL` (`arancel-atencion.ts:38-45`) es lineal: desde Aprobado solo se llega a Pagado y no hay camino WebPay paralelo. |
| 1378-1380 | Pago WebPay registrado automáticamente (verde) y correo a AR y AJ | No cumple | Confirmar un pago (`pagos.service.ts:96-114`) no actualiza `aranceles_atencion`. Además, `registrarPago` solo funciona desde Aprobado, así que el pago WebPay sin aprobación de AJ no tiene camino. No se envía correo. |
| 1388-1392 | AJ aprueba: botón naranjo pasa a amarillo | Cumple | `aranceles-atencion.service.ts:144-147`; botones en `atencion-detail.component.ts:196-198`; cuatro ojos en `:129-142` |
| 1392-1394 | Correo a aprueba.arancel@legalchile.cl con RUT, tipo y correlativo | No cumple | No hay correo ni la dirección configurada. |
| 1395-1398 | Rechazo: correo a AR con las razones; vuelve a rojo; se puede reenviar | Parcial | Vuelve a Requerido con `motivoRechazo` y el evento queda como "Rechazado" (`aranceles-atencion.service.ts:149-153`); la ficha muestra el motivo (`atencion-detail.component.ts:190`). No se envía **correo** ni aviso a AR. |
| 1414-1416 | Fin del flujo si no se valida; corregir y reiniciar | Cumple | Se puede reenviar desde Requerido; si cambia la materia se recalcula (`aranceles-atencion.service.ts:76-85`). |
| 1423-1427 | Finanzas: Reportes › Finanzas › Aranceles, filtrar por tipo de atención y listar "Pendiente de Pago" | Parcial | `GET aranceles-atencion` con estado y criterios (`aranceles-atencion.controller.ts:29-33`); bandeja y búsqueda en `finanzas.component.ts`; exportación XLSX (`exports.service.ts:118,325`). **Falta el filtro por tipo de atención**: `CriteriosBusquedaSchema` (`busqueda.ts:8-19`) no lo tiene. Además, la lista principal tiene tope fijo de 200 filas (`aranceles-atencion.service.ts:186`). |
| 1439-1441 | Buscar por RUT y tipo; abrir el detalle del arancel | Parcial | Se puede buscar por RUT y correlativo, no por tipo. No hay pantalla de detalle del arancel; el detalle está en la ficha de la atención. |
| 1441-1443 | Monto "A Pagar UF" calculado con la UF del día del pago | Cumple | `aranceles-atencion.service.ts:155-171`: exige la UF de `fechaPago` y guarda la UF y el CLP. |
| 1443-1444 | "Aceptar": correo a AR y jefe avisando que el pago se realizó | No cumple | No se envía correo ni aviso. |
| 1445-1449 | Imprimir comprobante (2 copias, monto en pesos, forma de pago…) | No cumple | Solo existe `comprobanteDocumentoId`, opcional y sin validar contra la atención (`aranceles-atencion.service.ts:169`). No se genera ningún PDF. |
| 1451 | Con pago WebPay no hay registro manual | No cumple | Depende del enlace WebPay–arancel, que no existe. |
| 1460-1463 | Arancel verde: AR pasa a Pendiente y se activan las gestiones de la materia o procedimiento | Cumple | El bloqueo se levanta con Pagado (`estados.ts:65`). Las gestiones se crean al abrir el caso (`atenciones.service.ts:284-292`), no al pagar; lo importante, que estén activas, se cumple. |
| 1470-1471 | Fin del flujo; AR continúa | Cumple | — |

**Observación técnica fuera del Anexo:** `cambiarEstado` escribe sin condicionar al estado leído (`atenciones.service.ts:405`, `.where(eq(atenciones.id, id))`). Esto incumple la regla de CLAUDE.md de responder 409 cuando otro usuario ya resolvió el cambio.

### Brechas más importantes
1. **Correos del flujo de arancel inexistentes**: a AJ al enviar, a aprueba.arancel@ al aprobar, a AR al rechazar y a AR/AJ al registrar el pago. Tampoco hay avisos en la aplicación en `aranceles-atencion.service.ts`.
2. **WebPay no está conectado al arancel**: falta "Notificar Pago" con link al cliente y el registro automático del pago. El mapa `TRANSICIONES_ARANCEL` no permite el camino WebPay ni cambiar de camino antes de Pagado.
3. **Comité judicial incompleto**: no hay bitácora de tareas con fecha ni validación de cumplimiento. "Revisado por Comité" no está ligado a `EnComite` y **no se exige al terminar con riesgo ≥20** (solo al abandonar).
4. **No hay comprobante imprimible del pago** ni filtro por tipo de atención en la búsqueda de aranceles de Finanzas.
5. **Plazos y comunicación con el cliente sin implementar**: contacto en 24 h hábiles, primera presentación en 5 días hábiles con revisión de AJJ, correo al cliente al iniciar y terminar gestiones, agenda de audiencias. Además, el código de grabación no existe en juicios y la provisión impaga no bloquea el inicio del juicio.


---

<!-- §X–XIV -->

## Revisión de cumplimiento: Anexo PSL, líneas 1477–2528 (§X Provisiones, §XI Búsquedas, §XII Reportes, §XIII Informes, §XIV Generalidades)

Solo lectura: no modifiqué ningún archivo ni ejecuté nada. Las referencias del anexo con "~" son aproximadas. Las rutas son relativas a /home/user/Legalmene.

### §X Flujo provisiones de fondo

| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 1488-1500 | Roles EC, EF, AR, AJ y GAF | Parcial | Permisos `provisiones.*` (packages/shared/src/types/permisos.ts:47-52). Perfiles CONTADOR/ASISTENTE (EC), GERENCIA_FINANZAS (EF y GAF juntos) y JEFATURA (AJ) en :140-206. EF y GAF no están separados. |
| 1511 | El abogado puede pedir provisión en cualquier etapa de la atención | Cumple | `solicitar()` en provisiones.service.ts:166-180; solo se bloquea en atenciones Terminada, Abandonada o Derivada (:44,168). |
| 1520-1535 | El cliente acepta o no; si paga directo no corre el flujo (no aplica a juicios) | No cumple | No hay registro de aceptación ni opción "cliente paga directo". |
| 1538-1550 | Ingresar varias PF, elegir cuáles notificar como Solicitada, una PF puede repetir el ciclo | Parcial | Cada PF nace directamente Solicitada (:173-177). No hay borrador ni selección múltiple. Un ciclo repetido requiere crear otra PF. |
| 1546-1550 | Correo a EC (solicitud.fondos@legalchile.cl) al solicitar | No cumple | `solicitar()` no llama a `notificar()`. No se envía ningún correo. |
| ~1555 | EC busca la PF por tipo de atención y correlativo | Parcial | Hay búsqueda por correlativo (criterios.ts:156). No hay filtro "tipo de atención" (CriteriosBusquedaSchema en busqueda.ts:8-20); solo sirve el prefijo del correlativo. |
| 1566-1575 | EC registra monto, medio y cuotas u otros datos del pago | Parcial | Solo se guardan medio (WebPay, CasaCentral o Transferencia) y fecha (provision.ts:57,90-93). No hay cuotas, efectivo/contado ni referencia de transferencia. La UI pide el medio como texto libre (provisiones.component.ts:190). |
| 1578-1585 | Estado Pagada y aviso a AR y AJ | Parcial | La transición existe (service:209-211). El aviso es solo en la app y solo a quien solicitó (:403-421); no hay correo ni aviso al AJ. |
| 1585-1590 | EC imprime comprobante de recibo en 2 copias | No cumple | No existe PDF de comprobante; el único PDF es la ficha de atención (exports/atencion-pdf.service.ts). |
| 1599-1615 | AR revisa el saldo y decide si alcanza | Cumple | `resumenAtencion()` (service:118-153) se muestra en la ficha (atencion-detail.component.ts:208-216). |
| 1617-1630 | Solicitar entrega → "En Aprobación", con fecha del cambio y correo al AJ | Parcial | La transición y la bitácora de fechas existen (service:213-217, :391-400; endpoint `/eventos`). Va de a un ítem (no hay checkbox ni selección múltiple) y no se avisa al AJ (la notificación va al solicitante). |
| 1633-1650 | AJ rechaza la entrega → vuelve a Pagada, correo al AR con motivo | Parcial | Vuelve a Pagada, motivo obligatorio y regla de cuatro ojos (service:221-257; provision.ts:99). El aviso es en la app, no por correo. |
| 1654-1663 | AJ autoriza → Autorizada, correo a AR, EF y GAF (autoriza.provision@) | Parcial | La transición existe (service:236-245). Solo hay aviso en la app al solicitante; EF y GAF no reciben nada y no hay correo. |
| 1666-1680 | EF marca "Monto Disponible" → Disponible, aviso a AR y AJ | Parcial | Existe (service:259-261) y exige `disponer_entregar`. No avisa al AJ ni envía correo. No hay V°B° de GAF dentro del sistema. |
| 1673-1675 | Entrega solo después de las 15:00 del día hábil siguiente a la aprobación | No cumple | `entregar()` (service:263-277) no valida ni día ni hora. |
| 1683-1700 | Retiro en 48 h hábiles: recordatorio a AR y AJ; 2 h después vuelve a Pagada con aviso a EF | Parcial | Un proceso diario a las 09:00 devuelve a Pagada pasados 2 días hábiles (provisiones.scheduler.ts:142; service:302-325). No hay recordatorio previo, no se respeta el desfase de 2 h, no se avisa a EF y no hay correo. Los días hábiles no consideran feriados (dias-habiles.ts:32-40). |
| 1703-1718 | EF entrega → Entregada desde un listado tipo cuenta corriente del abogado y comprobante firmado | Parcial | La transición y el monto entregado existen (service:263-277). No hay vista de cuenta corriente por abogado ni comprobante de entrega. |
| 1721-1730 | AR registra el gasto real con comprobante por actividad | Parcial | Movimientos de tipo Gasto, con tope en el saldo (service:337-363). `documentoId` es opcional (provision.ts:119), así que el comprobante no es obligatorio. |
| 1722, 1727 | Plazo de 8 días hábiles para el gasto y correo a AJ y AR por montos por rendir | No cumple | No hay plazo ni proceso programado para esto. |
| 1730-1733 | Con montos por rendir no se pide nueva entrega ni nueva provisión al cliente | Cumple | `assertSinRendicionPendiente` en solicitar, solicitarEntrega y entregar (service:156-164, :171, :215, :268-274). |
| ~1740-1755 | EC verifica y registra el saldo devuelto → "Reingresado", con comprobante | Parcial | Existe el movimiento Reintegro (service:337), pero también lo puede registrar el AR (perfil ABOGADO tiene `registrar_movimientos`). No existe el estado "Reingresado" (la rendición usa "Rendida", :280-287) ni comprobante. |
| 1757-1770 | El cliente pide rendición o el abogado sigue pidiendo provisiones | Cumple | Se pueden crear PF nuevas mientras la atención esté abierta. |
| 1772-1780 | Estado de cuenta de la atención y botón "Rendir Cliente" con correo a EF y EC | Parcial | El estado de cuenta existe (resumenAtencion). No hay botón "Rendir Cliente" ni correo. |
| 1785-1808 | EF registra "Rendición Cliente" con nº de cheque, verifica saldo 0 y "Cheque Devolución" con correo a AR y AJ | Parcial | `registrarDevolucion()` guarda el nº de cheque en una PF Rendida (service:290-300). Es por provisión, no por cuenta; no valida saldo 0, no avisa y no cambia de estado. |
| 1811-1820 | "Emitir rendición de fondos": comprobante en 3 copias | No cumple | No hay comprobante. |
| 1823-1830 | "Rendido a cliente" → todas las PF pasan a Rendido | No cumple | No existe ese botón ni ese estado (EstadoProvisionEnum en provision.ts:5-15). |
| ~1834 | El flujo termina solo con la atención Terminada | Cumple | La atención no se cierra con PF abiertas (estados.ts:80; atenciones.service.ts:367-384) y al cerrarla las Rendidas pasan a Cerrada (service:447-455). |
| (general) | Registro de cada cambio de estado | Cumple | `provisiones_eventos` (service:391-400) y GET `provisiones/:id/eventos` (controller:111). |

### §XI Búsquedas

| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| 1846-1852 | Tres familias de búsqueda, sin precarga, visibilidad según perfil | Cumple | `lm-criterios-busqueda` + `tieneCriterios` (busqueda.ts:24). El alcance se aplica con `filtroAtenciones()` en cada listado. |
| ~1858 | Búsquedas de atenciones para Administrador y área servicios | Parcial (verificar) | La exportación exige `exportar.datos`, que el perfil ABOGADO no tiene (permisos.ts:116-131). Confirmar si "área servicios" incluye a los abogados. |
| 1871-1879 | Consultas, criterios: correlativo, rut, abogado, canal, plan, competencia, materia, fechas, estado, bienes | Cumple | atenciones-list.component.ts:54 y criterios.ts:153-168. |
| 1871-1879 | Consultas, columnas en pantalla y XLSX | Parcial | El XLSX tiene todas las columnas (exports.service.ts:174-195). La pantalla solo muestra Correlativo, Tipo, Materia, Plan, Estado y Apertura (atenciones-list:92-97); faltan RUT, nombre, canal, abogado, fecha término, hora, estado de derivación y código de grabación. |
| ~1883 | Asesorías, columnas (incluye Bienes y Organismo) | Parcial | Organismo está en el XLSX (:196). Falta la columna **Bienes** en el XLSX, y en pantalla faltan las mismas columnas que en Consultas. |
| 1895-1902 | Juicios, columnas (incluye Bienes) | Parcial | Falta la columna Bienes; el XLSX agrega Tribunal y ROL (:197-201). Pantalla reducida. |
| ~1905-1912 | Estado de derivación: listado o búsqueda por correlativo, con todas las etapas y sus fechas | Parcial | derivaciones.component.ts:35,53 y exports:276-323. Solo muestra fecha de solicitud y de resolución, no todas las etapas. |
| 1926-1934 | Afiliados por plan (código o nombre): coberturas y materias; Admin edita; solo planes vigentes | Cumple (fase 5) | `GET /coberturas/resumen-planes` + `lm-resumen-planes` en la búsqueda; enlace a editar coberturas con `coberturas.administrar`. Antes: Lista afiliados por plan (afiliados-list:32). No muestra coberturas ni materias del plan y no filtra planes vigentes. Las coberturas están en otra pantalla (admin-coberturas, editable con `coberturas.administrar`). No hay pantalla web para editar planes (API: planes.controller.ts:25-32). |
| 1937-1944 | Afiliados por canal: resumen de planes vigentes y nº de RUT vigentes, desglose por plan con coberturas | Cumple (fase 5) | Mismo resumen filtrado por canal. Antes: El resumen existe solo como reporte (reportes.service.ts:125-177). No está en la búsqueda y no muestra coberturas ni materias. |
| 1947-1955 | Por RUT: vigencias, planes y coberturas; Admin edita todo y puede crear el RUT si no existe | Cumple (fase 5) | La ficha muestra las coberturas de sus planes vigentes. Antes: La ficha muestra planes y vigencias (afiliado-detail.component.ts:14); existe `afiliados.crear` y `afiliados.editar`. No muestra coberturas. |
| 1967-1976 | Aranceles: búsqueda por tipo de atención, correlativo, rut y abogado; estados y fechas de movimientos; abogados y jefaturas en solo lectura | Parcial | La UI (finanzas.component.ts:71) no ofrece abogado (la API sí lo acepta) ni tipo de atención. La grilla no muestra fecha de movimiento (el XLSX sí, exports:372). Requiere `finanzas.ver`, que ABOGADO y JEFATURA no tienen, así que no pueden consultarla. |
| 1980-1989 | Provisiones: búsqueda por tipo, correlativo, rut y abogado; estados y fechas; abogados en lectura, EC/Admin editan | Parcial | Hay correlativo, rut, abogado, plan, fechas y estado (provisiones.component.ts:38). Falta tipo de atención. Muestra solo la fecha de solicitud; el XLSX agrega la fecha de resolución (exports:378-429), no la bitácora completa. Las acciones dependen del permiso (provision-acciones.ts:11-26). |
| 1993-2001 | WebPay: búsqueda por tipo de pago, rut y fechas | Parcial | `condicionPagos` (pagos.service.ts:25-37) no filtra por tipo (plan o arancel). |
| 1996-2000 | WebPay: columnas orden, fecha, nombre, rut, monto, tipo, código, correo, región, comuna | Parcial | El XLSX las tiene todas (exports:431-470). La pantalla solo muestra Orden, Monto, Estado, Proveedor e Iniciado (pagos.component.ts:112-116). WebPay sigue siendo un stub. |
| 2001 | WebPay disponible para abogados y jefaturas en solo lectura | No cumple | Requiere `pagos.ver` (pagos.controller.ts:30; ruta en app.routes.ts:71), que ABOGADO y JEFATURA no tienen. |
| (todas) | Exportación a XLSX | Cumple | GET `exports/busquedas/:tipo.xlsx` (exports.controller.ts:34-44), con `libroXlsx` y tope de filas. |

### §XII Reportes y §XIII Informes

| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| ~2033-2045 | Reporte Plan: consultas de la nómina dentro de la vigencia RUT–Plan; asesorías y juicios contados por plan | Cumple | reportes.service.ts:54-56 y :69-121. |
| ~2047-2050 | Reporte Plan: exportar resumen **y listado de atenciones** | Parcial | xlsxPorPlan (:360) exporta solo el resumen, sin listado. |
| 2061-2075 | Reporte Canal sin duplicar | Parcial (verificar) | Usa la misma regla "dentro de vigencia" (:125-177). El anexo dice "posterior a la fecha de término" (posible error del documento; confirmar con el cliente). Exporta resumen y detalle por plan, sin listado de atenciones (:365-371). |
| 2097-2107 | Afiliados por plan y mes, export con lista de RUT | Parcial | Existe la serie mensual (:181-203) con XLSX (:374). Falta la lista de RUT vigentes. |
| 2110-2120 | Afiliados por canal agrupados por plan, con lista de RUT | Parcial | Solo filtra por canal en la misma serie; falta agrupar por canal y la lista de RUT. |
| 2148-2153, 2173-2180, 2190-2195 | Informe de afiliados (plan, canal, período, cliente), selección de campos, XLS con listado y hoja resumen | No cumple | Solo existe el informe de atenciones. |
| 2156-2165 | Informe de atenciones: filtros plan, canal, fecha, cliente, abogado, estado, materia, tema y tasa de uso | Parcial | El esquema acepta plan, canal, abogado y fechas (busqueda.ts:117-127); la UI no envía abogado (reportes.component.ts:304). Faltan cliente, estado, materia y tema. La tasa de uso está en los reportes por plan y canal (fórmula pendiente de validar con el cliente). |
| 2167-2170, 2182-2187 | Elegir tipos de atención y campos | Cumple | `tipos` y `campos` (busqueda.ts:98-127; reportes.component.ts:146). |
| ~2198-2204 | XLS con una hoja por tipo más hoja Resumen | Cumple | reportes.service.ts:206-256. |
| 2207-2211 | Formatos de exportación definidos por el administrador | No cumple | Las columnas están fijas en el código. |

### §XIV Generalidades (solo los ítems de búsqueda, reportes y notificaciones)

| Ref | Requisito (resumido) | Estado | Evidencia / qué falta |
|---|---|---|---|
| ~2250-2265 | Correo al vencer el plazo de una gestión | Cumple | vencimientos.scheduler.ts:24-80 (correo y aviso en la app). |
| ~2280, ~2450 | Comité con plazo, instructor y responsable, y reporte de pendientes | Parcial (verificar) | El esquema de comités solo tiene fechas de convocatoria, sesión y cierre (db/schema/comites.ts:46-48). El controller solo cuenta comités abiertos. |
| ~2440 | Cuantía con moneda y luego monto | Cumple | db/schema/atenciones.ts:58,109-110. |
| ~2445 | El administrador agrega campos por procedimiento o materia | No cumple | No hay nada equivalente en el esquema. |
| ~2460-2500 | Controller de asesorías y juicios: materias cubiertas por el plan, vigencia y selección de campos | No cumple | Los reportes cuentan por `atenciones.codPlan` sin cruzar coberturas y sin selección de campos. |
| ~2480-2500 | Controller de consultas (cruce por vigencia) | Parcial | Está el cruce en porPlan, pero no la selección de campos. |
| ~2500-2510 | Controller de usuarios: carga por usuario, perfil, cargo, área, plan y canal; ver y modificar comités | Parcial | reportes.service.ts:259-329 filtra por perfil, jefe, plan y canal. No hay cargo ni área; los comités solo se cuentan. |
| ~2515 | Admin crea y elimina perfiles | Parcial (verificar) | admin-perfiles existe; los perfiles del sistema no se pueden eliminar (permisos.ts:166-167). |
| ~2525 | Correo con el detalle tras cada carga masiva | No cumple | Solo aviso en la app (cargas-masivas.service.ts:450); falta SES. |

### Brechas más importantes
1. **No se envía ningún correo en provisiones**: no llegan a solicitud.fondos@ ni a autoriza.provision@, y no se avisa a AJ, EF, GAF ni EC. Solo hay avisos dentro de la app al solicitante, que es la única cobertura de notificaciones.
2. **Faltan el cierre con el cliente y los comprobantes**: no hay estados Reingresado ni Rendido, ni "Rendir Cliente", "Cheque Devolución" o "Rendido a cliente" (el cheque es solo un campo sin validar saldo 0), y no existe ningún comprobante PDF (recibo, entrega, rendición) ni cuenta corriente por abogado.
3. **Plazos de provisiones incompletos**: no hay plazo de 8 días hábiles para el gasto, ni restricción de entrega "después de las 15:00 del día hábil siguiente", ni recordatorio antes de la reversión a las 48 h. Además, los días hábiles no consideran feriados.
4. **Búsquedas incompletas**: en pantalla faltan columnas (Consultas, Asesorías, Juicios y WebPay muestran muchas menos que el XLSX); el XLSX de Asesorías y Juicios no trae la columna Bienes; no hay filtro "tipo de atención" ni "tipo de pago"; las búsquedas de afiliados no muestran coberturas ni materias; abogados y jefaturas no tienen acceso a aranceles ni WebPay (`finanzas.ver` / `pagos.ver`).
5. **Reportes e informes**: no existe el informe de afiliados con selección de campos y hoja resumen; los reportes por plan, canal y afiliados no exportan el listado de atenciones ni de RUT; el controller de asesorías y juicios no cruza materias cubiertas; falta el correo de cargas masivas.
