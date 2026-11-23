# Plan de cumplimiento del Anexo PSL — NEXUS

Plan priorizado para cerrar las brechas entre NEXUS y el *Anexo Definición Requerimiento PSL*
(PDF de 59 páginas). Sale de la revisión requisito por requisito del 23-11-2026 sobre el commit
`93a89e1`: ~69 requisitos cumplen, ~118 son parciales, ~44 no cumplen y 6 no son verificables en
código. El detalle con evidencia está en [`cumplimiento-anexo-detalle.md`](./cumplimiento-anexo-detalle.md).

**Cómo usar este documento:** marcar `[x]` cada ítem al terminarlo, con el commit al lado
(`— abc1234`). Las referencias `§` y las líneas son del Anexo. Estimaciones para una persona a
tiempo completo; son orientativas.

**Criterios de prioridad:** primero lo que impide operar el día a día, luego lo de mayor valor
por esfuerzo (lo que la API ya soporta y falta en la web), y al final lo que depende de terceros
(Transbank, central telefónica) o de levantamiento con el cliente.

| Fase | Tema | Estimación | Depende de |
|---|---|---|---|
| 0 | Ajustes inmediatos y decisiones | 1–2 días | — |
| 1 | Operable desde la web | ~1,5 semanas | — |
| 2 | Comunicaciones por correo | ~1,5 semanas | Dominio verificado en SES |
| 3 | Controles y plazos del negocio | ~1 semana | Fase 2 (avisos) |
| 4 | Finanzas completas | ~1,5 semanas + WebPay | SDK y credenciales Transbank |
| 5 | Búsquedas, reportes y cargas | ~1 semana | Formato SGC-RG-OP-004 |
| 6 | Agenda, comité y telefonía | ~2 semanas | Levantamiento + proveedor de telefonía |
| 7 | Producción (en paralelo desde fase 2) | ~2–3 semanas | Cuenta AWS, tenant Entra ID |

Total estimado: 10–12 semanas. Las fases 1–3 (~4 semanas) dejan el sistema usable y alineado con
las reglas del Anexo. Conviene iniciar ya las gestiones con Transbank y el proveedor de telefonía.

---

## Fase 0 — Ajustes inmediatos y decisiones (1–2 días)

- [x] `AtencionesService.cambiarEstado` y el paso a "Derivada": escritura condicional al estado leído (409 si cambió), según la regla de la auditoría run-2.
- [x] `CLAUDE.md`: Entra ID no está en el frontend (solo backend); la infraestructura CDK ya existe en `infra/cdk`.
- [ ] Decisiones con LegalChile (bloquean fases posteriores):
  - [ ] ¿Un RUT no registrado puede atenderse como Rezagado/MetLife con alta rápida? (§VI l.524)
  - [ ] Formato oficial de carga "SGC-RG-OP-004" (xlsx/csv y sus 5 campos obligatorios). (§III l.192)
  - [ ] Regla del reporte por canal ("posterior a la fecha de término" parece un error). (§XII l.2061)
  - [ ] Fórmula de la tasa de uso.
  - [ ] ¿Los abogados son parte del "área servicios" que puede exportar búsquedas? (§XI ~l.1858)
  - [ ] Proveedor y API de la central telefónica (grabaciones por anexo). (§VI l.619)
  - [ ] Escala de riesgo (0–10 por factor) y si el comité es obligatorio al **terminar** con riesgo ≥ 20.

## Fase 1 — Operable desde la web (~1,5 semanas)

- [x] Subir documentos desde la ficha (botón hoy sin acción), solo PDF. (§VI 3.4/5, §VII 04, §VIII)
- [x] Afiliados: crear, editar y eliminar/restaurar en la web; alta rápida desde una consulta. (§II l.131)
- [x] Usuarios: crear desde Administración, con campo "cargo". (§II l.106, §IV l.338)
- [x] Pantalla de planes: alta, término de vigencia (fecha), asignar/copiar coberturas. (§II l.118, §I l.79)
- [x] Nueva consulta: buscar afiliado por RUT (sin lista precargada), plan preseleccionado por mayor cobertura. (§VI l.504, l.518)
- [x] "Nuevo correlativo" que permita cambiar competencia y materia (la API ya lo soporta). (§VI l.604)
- [x] Gestiones: responsable, fecha de inicio y fecha real de término; botón "Completar" en la ficha. (§VII l.860, §VIII l.1122)
- [x] Fecha de término al abandonar o terminar (la API ya la acepta). (§VII l.757, §VIII l.1096)
- [x] Código de grabación en asesorías y juicios, no solo en consultas. (§VI l.694, §VII l.947, §VIII l.1251)
- [x] Lectura de aranceles y WebPay para abogados y jefaturas (migración de permisos). (§XI l.1967, l.2001)
- [x] Selector de abogado al crear la atención (tramitador asigna). (§IV l.387)

## Fase 2 — Comunicaciones por correo (~1,5 semanas)

- [ ] Servicio de correo (SES en producción; proveedor alternativo para la demo), plantillas en español y bitácora de envíos por atención.
- [ ] Aranceles: al enviar (a AJ), al aprobar (`aprueba.arancel@`), al rechazar con motivo (a AR), al registrar el pago (AR y jefatura). (§IX)
- [ ] Provisiones: solicitud (`solicitud.fondos@`), autorización (`autoriza.provision@`, EF, GAF), disponible (AR, AJ), recordatorio antes de 48 h, reversión (EF), entrega. (§X)
- [ ] Asignación de abogado y aviso a jefatura de entrevistas/correos/chats. (§VI l.667, §VIII l.980)
- [ ] Cliente: presentación del abogado, formulario de antecedentes (y cuestionario de divorcio), inicio y término de gestiones, informe final. (§VI l.537, §VII, §VIII l.1125)
- [ ] Resumen de cargas masivas a `operaciones@`, con RUT nuevos y eliminados. (§III l.308)
- [ ] Aviso al administrador de errores de funcionamiento. (§I l.66)

## Fase 3 — Controles y plazos del negocio (~1 semana)

- [x] Feriados chilenos en `dias-habiles.ts` (todos los plazos dependen de esto).
- [x] Plazos con alerta: contacto en 24 h hábiles, primera presentación del juicio en 5 días hábiles, gasto rendido en 8 días hábiles, entrega de fondos después de las 15:00 del día hábil siguiente. (§VII l.765, §VIII l.1106, §X l.1673, l.1722)
- [x] V°B° de jefatura antes de Terminada (asesorías y juicios). (§VII l.904, §VIII l.1192)
- [ ] Comité obligatorio al terminar con riesgo ≥ 20 y "Revisado por comité" ligado al estado EnComite. (§VIII l.1196, l.1217)
- [x] Autorización de Gerencia de Servicios cuando no hay cobertura. (§VII l.750)
- [x] Arancel impago bloquea también gestiones; provisión impaga bloquea el inicio del juicio. (§VII l.797, §VIII l.1076)
- [x] Bloqueo de cuenta tras 3 intentos fallidos, con aviso al administrador. (§I l.65)

## Fase 4 — Finanzas completas (~1,5 semanas + WebPay)

- [x] Comprobantes PDF: recibo de arancel (2 copias), entrega de fondos, rendición al cliente (3 copias). (§IX l.1445, §X l.1585, l.1811)
- [x] Cierre con el cliente: "Rendir cliente", cheque de devolución validando saldo 0, estados Reingresado y Rendido a cliente. (§X l.1740–1830)
- [x] Cuenta corriente por abogado; cuotas y referencia de transferencia en pagos. (§X l.1566, l.1703)
- [x] Separar roles EF y GAF; registro de saldo devuelto solo por EC. (§X l.1488, l.1740)
- [ ] WebPay real: link de pago al cliente, registro automático del pago, camino alternativo a casa central. (§IX l.1352–1380) — *depende de Transbank*

## Fase 5 — Búsquedas, reportes y cargas (~1 semana)

- [ ] Columnas en pantalla equivalentes al Excel; columna "Bienes" en asesorías y juicios. (§XI)
- [x] Filtros "tipo de atención" (aranceles, provisiones) y "tipo de pago" (WebPay). (§IX l.1423, §XI)
- [ ] Búsquedas de afiliados con coberturas y materias del plan; solo planes vigentes. (§XI l.1926–1955)
- [ ] Estado de derivación con todas las etapas y fechas. (§XI ~l.1905)
- [ ] Informe de afiliados con selección de campos y hoja resumen; listados de atenciones y RUT en reportes. (§XII, §XIII)
- [ ] Carga masiva de coberturas y de atenciones; campo Ciudad; maestros región/ciudad/comuna; canales editables. (§I l.54, §II l.141, l.150)
- [x] Stock: no dar de baja un RUT que viene en el archivo con error de validación. (§III l.293)

## Fase 6 — Agenda, comité y telefonía (~2 semanas; requiere levantamiento)

- [ ] Agenda de citas por abogado y jefatura; calendario mensual de audiencias. (§IV l.358, §VI l.662, §VIII l.1130)
- [ ] Comité como bitácora: compromisos con plazo y responsable, validación en la sesión siguiente. (§VII l.951, §VIII l.1142)
- [ ] Central telefónica: "Obtener grabación" por anexo y "Mantención de audio". (§VI l.583, l.619) — *depende del proveedor*

## Fase 7 — Producción (~2–3 semanas, en paralelo desde fase 2)

- [ ] Login con Microsoft (Entra ID / MSAL) en la web. (§I l.21)
- [ ] Despliegue en AWS con la infraestructura CDK (Aurora Multi-AZ, ECS, S3, WAF), sin `AUTH_DISABLED`. (§I l.51)
- [ ] Migración SQL Server 2008 → Aurora: scripts, ensayo y validación. (§I l.58)
- [ ] Herramientas del administrador para reabrir o retroceder flujos. (§II l.156)
- [ ] Manuales de usuario y de administrador; capacitación. (§I l.70)
- [ ] Revalidar con una auditoría completa las unidades de run-1 cuyo código cambió, y las 3 áreas diferidas de run-2 (edición de atención vs comité, decisión de comité vs votos, comprobantes de otra atención).

---

## Registro de avance

| Fecha | Fase | Avance | Commit |
|---|---|---|---|
| 2026-11-23 | — | Plan creado a partir de la revisión del Anexo | — |
| 2026-11-23 | 0 | Estados de atención condicionales (409); derivar consulta cerrada es 409; CLAUDE.md corregido | ver commit siguiente |
| 2026-11-23 | 1 | Subida de documentos PDF desde la ficha (API valida PDF y 100 MB) | 909083e |
| 2026-11-23 | 1 | Afiliados: alta, edición, eliminar/restaurar, asignar y terminar planes en la web | 3e0978b |
| 2026-11-23 | 1 | Nueva atención: afiliado por RUT con alta rápida; plan vigente de menor copago preseleccionado | 342ba9f |
| 2026-11-23 | 1 | Usuarios: alta desde Administración con cargo (migración 0017); vínculo con Entra ID por correo | 8feae22 |
| 2026-11-23 | 1 | Planes: pantalla de alta/edición, fecha de término (migración 0018) que corta la vigencia de todos sus RUT, copiar coberturas | 016694c |
| 2026-11-23 | 1 | Nuevo correlativo con competencia/materia/tipo; la ficha recarga al pasar de una atención a otra | 1f0f0c9 |
| 2026-11-23 | 1 | Fecha real de término al abandonar/terminar (validada); código de grabación en todos los tipos | fb29b5f |
| 2026-11-23 | 1 | Abogados y jefaturas: lectura de aranceles y pagos WebPay acotada a sus atenciones (migración 0019) | f22ca0a |
| 2026-11-23 | 1 | Selector de abogado al crear la atención; la API valida que el asignado exista y esté activo | e4fa43d |
| 2026-11-23 | 1 | Gestiones: diálogo con tipo, responsable, inicio y compromiso; Completar con fecha real (409 si ya está cerrada). **Fase 1 completa** | e31fa84, d441057 |
| 2026-11-23 | 3 | Feriados: tabla `feriados` (migración 0020) con los legales calculados por año y los agregados por el administrador; los plazos en días hábiles los saltan | e171d41 |
| 2026-11-23 | 3 | Plazos: contacto 24 h hábiles (primer contacto, migración 0021), primera presentación 5 días, rendición 8 días; aviso diario de vencidos; entrega de fondos desde las 15:00 del día hábil siguiente | 6024ee3 |
| 2026-11-23 | 3 | V°B° de jefatura para terminar asesorías y juicios: solicitud, aprobación o rechazo con cuatro ojos (migración 0022, permiso `atenciones.aprobar_termino`) | 705c4be |
| 2026-11-23 | 3 | Arancel impago: solo gestiones de contacto con el cliente; provisión solicitada e impaga impide iniciar la tramitación del juicio | 4595685 |
| 2026-11-23 | 3 | Sin cobertura del plan: autorización de Gerencia de Servicios (migración 0023, permiso `atenciones.autorizar_sin_cobertura`); rechazada, solo se abandona | 8586669 |
| 2026-11-23 | 3 | Bloqueo tras 3 intentos fallidos (enlace ya usado o vencido) con aviso a los administradores; avisos de sistema sin plan (migración 0024) | 6f8910a |
| 2026-11-23 | 4 | Comprobantes PDF de pago del arancel y de recepción de provisión (2 copias); rendición al cliente pendiente con el cierre | 37ee781 |
| 2026-11-23 | 4 | Cierre con el cliente: reingreso del saldo por el contador (Reingresado), Rendir cliente, cheque por el saldo total, comprobante de rendición (3 copias) y Rendido a cliente (migración 0025) | b32eab9 |
| 2026-11-23 | 4 | Pagos de arancel y provisión: diálogo con medio, fecha, cuotas y referencia (obligatoria en transferencias; migración 0026) | bb13679 |
| 2026-11-23 | 4 | Cuenta corriente por abogado, comprobante de entrega de fondos (2 copias) y perfil Ejecutivo de Finanzas separado de Gerencia de Finanzas (migración 0027). Fase 4 completa salvo WebPay | 94632f0 (PR #15) |
| 2026-11-23 | 5 | STOCK conserva lo que viene en el archivo aunque su fila tenga error; cargas y bienes ya no dan de baja todo el plan si ninguna fila es válida | 28a3682 |
| 2026-11-23 | 5 | Filtro por tipo de atención en aranceles y provisiones (pantalla y Excel) y por tipo de pago en WebPay | ver commit |
