# Requerimientos PSL (Anexo LegalChile) y brechas

Fuentes:
- **Anexo "Definición Requerimiento PSL"** (59 págs.) — procesos BPMN del cliente.
- **Propuesta Tooxs** "Plataforma Integral de Gestión Legal y Operación de Servicios" — alcance cerrado v1.0, UF 480 + soporte 30 UF/mes, 28–32 semanas en 8 fases. Su Anexo 1 contiene los mockups (Dashboard, Ficha de Caso, Búsqueda y Reportes) que sigue el frontend.

> **Decisión de stack (2026-11):** se mantiene **NestJS + AWS** (este repo). La propuesta
> Tooxs ofrece Azure App Service + Python/FastAPI + SharePoint + Key Vault; la propuesta
> comercial debe ajustarse al stack real antes de firmarse. Coinciden: Angular, PostgreSQL,
> Microsoft Entra ID.

## 1. Conceptos de negocio que mandan sobre el modelo

| Concepto | Definición en el Anexo |
|---|---|
| **Afiliado** | Persona identificada por RUT (único). Datos: nombre, dirección, correo, fono, región, ciudad, comuna. |
| **Plan** | Producto contratado (no es un tenant). Pertenece a un **canal**. Plan no vigente no aparece en la lista del RUT ni permite atenciones. |
| **PlanesAfiliado** | Relación RUT–Plan con `FechaInicio`/`FechaTermino`. Un RUT puede tener varios planes. |
| **Cobertura** | Por plan: precio en UF o % de cobertura sobre el arancel de cada materia. Se asigna al crear el plan. |
| **Arancel** | Valor (UF) por materia. El copago = arancel no cubierto por el plan. |
| **Cargas / Bienes** | Algunos planes cubren familiares (cargas) o bienes del afiliado, por relación RUT–Plan. |
| **Rezagado / MetLife** | Planes especiales para RUT sin plan vigente (o con seguro MetLife). |
| **Correlativo** | Identificador visible de cada atención; varias consultas en una llamada generan varios correlativos. |

## 2. Perfiles (Anexo §IV)

Admin de sistema → Gerencia Servicios (Jefatura Consultas / Judicial / Fraude → Abogado → Asistente / Procurador / Tramitador), Gerencia Finanzas (Contador → Asistente Contable), Comercial, Administrativo.

- **Jefaturas** aprueban aranceles, provisiones y derivaciones de sus colaboradores; ven informes y agendas.
- **Abogado** ve solo sus atenciones; gestiona su agenda.
- **Tramitador/Procurador/Asistente** registran gestiones en asesorías/juicios, dejan notas, crean atenciones y las asignan (correo al abogado).
- **Contador / Asistente contable** operan flujos de aranceles y provisiones.
- **Comercial / Administrativo**: lectura de vigencias y atenciones por RUT (Comercial además Reportes).
- El Admin debe poder **crear perfiles y definir accesos por módulo y por acción**. Perfiles desactivados no aparecen en listas, sí en históricos.
- Login: dominio LegalChile (Entra ID) + **anexo telefónico** (llave para buscar grabaciones del día). Bloqueo tras 3 intentos fallidos con aviso al admin.

## 3. Procesos

### Consultas (§VI)
Canales: telefónico, entrevista personal, e-mail, chat, videoconferencia. Al ingresar RUT se muestran **solo planes vigentes** (prioridad al de mayor cobertura); si no hay, Rezagado/MetLife. Campos: competencia, materia, tipo de consulta, nota/respuesta; fecha y hora de inicio automáticas al pulsar "Ir", hora de término al guardar. "Nuevo correlativo" para consultas adicionales en la misma llamada. Código de grabación asociado. Puede solicitar **derivación**.

### Derivación
Consulta → asesoría o juicio, con aprobación de jefatura; crea el nuevo correlativo vinculado al original. Estados: solicitada, en revisión, aprobada, rechazada, derivada, cerrada.

### Asesorías (§VII) y Juicios (§VIII)
- Revisión de cobertura → presentación al cliente (≤24 h hábiles) → **arancel** (si hay copago, la atención queda detenida hasta el pago) → **provisión de fondos** (según competencia/materia) → gestiones → comité → V°B° jefatura → informe al cliente → término.
- Gestiones **predefinidas por materia/procedimiento, con orden y plazo estándar**. Inicio y término se informan al cliente por correo. Aviso al abogado el día anterior al vencimiento.
- **No se puede terminar** una asesoría/juicio con gestiones o comité pendientes.
- Juicio: estados Asignado → Pendiente (al presentar el primer escrito: tribunal, causa ROL/RIT, RUC, cuantía con moneda) → … → Terminado (fecha y causa de término) / Abandonado. Calidad procesal, procedimiento, contraparte (razón social, RUT, representante, abogado). **Riesgo** = materia + cuantía + cliente; riesgo ≥ 20 requiere "Revisado por Comité" antes de cerrar o abandonar.
- Comité: actividades con fecha de registro, plazo, instructor y responsable; consultable en reportes.
- Recursos/Incidentes **no** se consideran en la nueva versión.

### Arancel (§IX) — por atención
Estados: requerido (rojo) → enviado a aprobación (naranjo) → aprobado por jefatura (amarillo, correo a aprueba.arancel@) → pagado (verde). Pago en casa central o WebPay; monto en UF calculado con la **UF del día de pago**. Rechazo vuelve a rojo con motivo. Finanzas registra pagos y emite comprobante.

### Provisión de fondos (§X)
Solicitada → Pagada (EC registra el pago del cliente) → En aprobación (AR pide entrega) → Autorizada (AJ) / Rechazada (vuelve a Pagada) → Disponible (EF; retiro desde 15:00 del día hábil siguiente) → Entregada → Gasto real con comprobante (≤ 8 días hábiles) → Reingreso de saldo → Rendición al cliente / Devolución (cheque) → Rendida.
- Sin retiro en 48 h hábiles: aviso y luego vuelve a Pagada.
- **Mientras haya montos por rendir no se puede pedir nueva entrega ni nuevas provisiones.**
- Saldos tipo cuenta corriente por abogado y por causa. Cada cambio registra usuario y fecha.

### Carga masiva (§III)
Afiliados por **flujo** (agrega RUT y actualiza FechaTermino) o **stock** (reemplaza la nómina del plan: los RUT ausentes reciben FechaTermino = hoy y quedan "Eliminado"). Primeros 5 campos obligatorios. También **cargas** y **bienes** por RUT–Plan. Al terminar, resumen (planes, RUT nuevos, eliminados, con error en xlsx) por correo a operaciones@.

### Búsquedas (§XI) y Reportes (§XII–XIII)
- Búsquedas **sin precarga**: no se muestran datos hasta aplicar filtros. Exportación a Excel según perfil.
- Familias: Afiliados (RUT, plan, canal), Atenciones (consultas, asesorías, juicios, estado de derivación), Finanzas (aranceles, provisiones, WebPay).
- Reportes por plan y canal cruzando PlanesAfiliado con atenciones dentro de la vigencia RUT–Plan; **tasa de uso** = atenciones / afiliados del periodo; informes con selección de campos, XLS con hoja resumen.
- **Controller de usuarios**: carga por usuario/perfil/área (asignadas, pendientes, terminadas, comités).

### Administración (§II)
Mantenedores: competencias, materias y gestiones por materia, tipos de consulta, causas de término, calidad procesal, procedimientos, tribunales, tipos de acción, regiones/ciudades/comunas, canales, organismos, horarios por perfil, planes y coberturas. Herramientas para retroceder flujos (p. ej. reiniciar derivaciones).

### Generales
Logs (accesos, acciones, errores con aviso al admin), alta disponibilidad, documentación y capacitación. **Posesión efectiva**: módulo con formularios imprimibles (a definir en discovery).

## 4. Brechas contra el código actual

| Área | Estado actual | Brecha |
|---|---|---|
| Plan / multi-tenancy | `cod_plan` actúa como tenant (`X-Cod-Plan`) | Plan es producto; acceso por perfil y propiedad de la atención |
| Afiliados | Una fila por RUT+plan | Afiliado único por RUT + `planes_afiliado` con vigencias |
| Coberturas | No existen | Por plan y materia (UF o %) |
| Aranceles | Catálogo **por plan** | Por materia (global) + estado por atención |
| Maestros | Competencia como enum fijo | Tablas administrables (materias, tribunales, canales, etc.) |
| Perfiles | 5 roles fijos | 11 perfiles + permisos por módulo/acción configurables |
| Consultas | Formulario básico | Canal, grabación, horas automáticas, nuevo correlativo |
| Derivación | Directa | Con aprobación de jefatura y estados |
| Juicios | Sin datos judiciales | Tribunal, ROL/RIT, RUC, cuantía, riesgo, contraparte |
| Gestiones | Libres | Plantillas por materia con orden y plazo; reglas de cierre |
| Provisiones | 3 estados + movimientos | Ciclo de 13 estados con roles de finanzas |
| Carga masiva | Solo afiliados | Cargas y bienes; correo de resumen |
| Búsquedas | Precargan datos | Sin precarga |
| Posesión efectiva | No existe | Módulo nuevo |

## 5. Plan de trabajo

1. **Modelo núcleo** — afiliado único + `planes_afiliado`, canales, plan como producto, fin del tenant por `X-Cod-Plan`; consulta por RUT con planes vigentes; carga flujo/stock sobre `planes_afiliado`.
2. **Maestros y finanzas base** — competencias/materias/procedimientos/tribunales, aranceles por materia, coberturas por plan, cálculo de copago.
3. **Flujos** — consulta → derivación aprobada → asesoría/juicio; arancel por atención; provisiones completas; plantillas de gestiones y reglas de cierre.
4. **Perfiles configurables** y control por propiedad de la atención.
5. **Búsquedas sin precarga, reportes, controller**, cargas y bienes, posesión efectiva.
