# Manual del administrador — NEXUS (LegalChile)

Tareas del perfil **Administrador del sistema** (y de quien tenga los permisos de administración). El
uso diario está en `manual-usuario.md`; la operación técnica (despliegue, respaldos, incidentes) en
`runbook.md`.

---

## 1. Usuarios

**Administración → Usuarios**

- **Alta:** correo del dominio permitido, nombre, cargo, perfil, jefatura directa y anexo. El usuario
  entra con el enlace por correo (o con Microsoft, si está habilitado: se vincula por correo en su
  primer ingreso).
- **Jefatura directa:** define el "equipo" de cada jefatura (lo que ve, aprueba y recibe en avisos).
- **Desactivar / bloquear:** quien está inactivo o bloqueado no puede operar. Tras 3 intentos fallidos
  de ingreso la cuenta se bloquea sola y los administradores reciben un aviso; **desbloquear** reinicia
  el contador.
- Nadie puede cambiar su propio perfil ni otorgar permisos que no tiene.

## 2. Perfiles y permisos

**Administración → Perfiles**

No hay roles fijos: cada perfil es un conjunto de permisos. Los perfiles del sistema (Abogado,
Jefaturas, Gerencia de Servicios, Tramitador, Contador, Asistente contable, Ejecutivo y Gerencia de
Finanzas, Comercial, Auditor y Administrador)
se pueden ajustar pero no eliminar; el **Administrador** tiene siempre todos los permisos. Permisos que
conviene revisar con LegalChile:

| Permiso | Quién lo tiene por defecto |
|---|---|
| `agenda.calendario_audiencias` (recibe aviso de audiencias) | Jefatura Judicial, Gerencia de Servicios |
| `atenciones.aprobar_termino` (V°B° de término y de primera presentación) | Jefaturas, Gerencia de Servicios |
| `atenciones.autorizar_sin_cobertura` | Gerencia de Servicios |
| `exportar.datos` | Jefaturas, Gerencia de Servicios, Gerencia de Finanzas |
| `flujos.corregir` (Correcciones) | Solo Administrador |

## 3. Maestros

**Administración → Maestros**

Competencias, materias (y a qué tipo de atención aplican), procedimientos, tribunales, organismos, tipos
de consulta, causas de término, calidades procesales, **canales**, **regiones**, **ciudades y comunas**
(por región), gestiones predefinidas por materia o procedimiento y **feriados**.

- **Desactivar** oculta el valor en formularios nuevos sin tocar los registros históricos; no se borra.
- **Feriados:** los legales se calculan solos para el año en curso y el siguiente; agregue los de
  decreto o elecciones. Afectan todos los plazos en días hábiles.

- **Campos adicionales** (**Administración → Campos adicionales**): campos que la ficha pide para una
  materia o un procedimiento (y, si quiere, solo para un tipo de atención): texto, número, fecha, lista de
  opciones o sí/no, obligatorios o no. Desactivar un campo lo oculta sin borrar lo ya registrado.
- **Formatos de exportación** (**Administración → Formatos de exportación**): elija las columnas y su orden
  para cada planilla de búsqueda. "Volver a todas las columnas" quita el formato.

- **Tipos de gestión** (**Maestros → Tipos de gestión**): nombres editables; cada uno tiene una categoría del sistema
  (llamada, correo, reunión, escrito judicial…) que define las reglas (p. ej. con arancel impago solo se permiten
  llamadas, correos y reuniones).
- **Materias:** además de "Requiere provisión", la *provisión estimada* en pesos que se informa al cliente.
- **Horario de acceso por perfil** (**Administración → Perfiles**): días y horas (hora de Chile) en que el perfil puede
  usar el sistema. El Administrador nunca se restringe.

## 4. Planes, aranceles y coberturas

- **Planes:** productos contratables, con canal y término de vigencia. Un plan vencido o desactivado no
  admite nuevas atenciones. *Copiar coberturas* copia las reglas de otro plan.
- **Aranceles:** valor en UF por materia (y opcionalmente por tipo de atención); es igual para todos los
  planes.
- **Coberturas:** por plan, regla general o por materia y tipo; modalidad porcentaje cubierto, valor fijo
  en UF o sin cobertura. La regla más específica gana. Sin regla o sin cobertura, el afiliado paga el
  arancel completo y la atención queda pendiente de autorización.
- **UF:** el contador registra el valor diario; un pago de arancel exige la UF de esa fecha.

## 5. Cargas masivas

**Afiliados → Cargas masivas** (permiso `cargas.ejecutar`). Elija la entidad, el plan y la modalidad,
y suba un CSV (el formato esperado se ve en la misma pantalla).

| Entidad | FLUJO | STOCK |
|---|---|---|
| Nómina (afiliados) | agrega y actualiza; un RUT existente no cambia sus datos | además termina los RUT del plan que no vienen |
| Cargas / Bienes | agrega y actualiza | además termina los del plan que no vienen |
| Coberturas (`coberturas.administrar`) | agrega o reemplaza la regla de igual materia y tipo | además desactiva las reglas ausentes |
| Atenciones | crea cada fila con las mismas reglas del formulario | no aplica |

STOCK nunca da de baja lo que viene en el archivo aunque su fila tenga error. Al terminar, quienes
ejecutan cargas y la casilla de operaciones reciben el **resumen por correo** con los RUT nuevos y
terminados; el reporte XLSX trae además las filas con error.

## 6. Correcciones

**Administración → Correcciones** (permiso `flujos.corregir`). Busque la atención por correlativo:

- **Reabrir atención** terminada o abandonada (vuelve a su etapa de trabajo).
- **Reiniciar derivación:** una rechazada vuelve a "Solicitada"; una aprobada también, si la atención
  derivada no tiene trabajo (gestiones completadas, provisiones ni arancel pagado): esa atención queda
  abandonada y la consulta vuelve a "Respondida".
- **Retroceder arancel** un paso (p. ej. anular un pago mal registrado).
- **Retroceder provisión** un paso (no se deshace una entrega con gastos registrados).

Cada acción pide un **motivo**, que queda en la bitácora del flujo, en la ficha (metadata de
correcciones) y en la auditoría. Úselas solo para corregir errores.

## 7. Auditoría y avisos del sistema

- **Control → Auditoría:** registro de todas las acciones que modifican datos (sin credenciales).
  Lo de más de un año se archiva cada mes (en S3 en producción) y solo entonces se borra de la tabla.
- Los **errores de funcionamiento** llegan como aviso y correo a los administradores (uno por ruta y
  día).

## 8. Webhooks

**Administración → Webhooks:** integraciones que reciben eventos de atenciones. La URL debe ser pública
(https) y el secreto de firma se muestra solo al crear o rotar.

## 9. Buscador

**Administración → Buscador** (permiso `busqueda.administrar`): estado del buscador de texto completo de atenciones y
afiliados (tolera tildes y errores de tipeo). Si no está configurado o no responde, las búsquedas siguen funcionando con la
base de datos. "Reindexar todo" reconstruye los índices (tras crear el buscador o cambiar sus campos); los cambios del día a
día se indexan solos al guardar y cada minuto.

## 10. Configuración de producción (con el equipo técnico)

Ver `runbook.md › Despliegue`. Antes de salir a producción:

- Correo: `SES_ENABLED=true`, remitente verificado (`SES_FROM`) y las casillas `CORREO_APRUEBA_ARANCEL`,
  `CORREO_SOLICITUD_FONDOS`, `CORREO_AUTORIZA_PROVISION` y `CORREO_OPERACIONES`. Sin SES, los correos
  quedan registrados como "No enviado (sin SES)".
- Ingreso con Microsoft: registro de la aplicación en el Entra ID de LegalChile.
- `BOOTSTRAP_ADMIN_EMAILS`: correo del primer administrador.
- Nunca `AUTH_DISABLED=true` en producción.
