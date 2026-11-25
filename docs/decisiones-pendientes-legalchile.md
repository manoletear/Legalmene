# Decisiones pendientes de LegalChile

Preguntas que el equipo de NEXUS no puede resolver solo: el Anexo es ambiguo, se contradice o deja la regla a
criterio del negocio. Para cada una: qué dice el Anexo, qué hace hoy el sistema, las alternativas y una
recomendación. **Basta responder con la letra de la alternativa elegida** (o una regla distinta).

Estado del sistema al 25-11-2026: 193 requisitos del Anexo cumplidos, 34 parciales y 3 sin cumplir (los tres
dependen de terceros). Detalle en `docs/cumplimiento-anexo-detalle.md`.

---

## 1. RUT no registrado: ¿se atiende como Rezagado o MetLife con alta rápida?

- **Anexo (§VI l.524):** si el RUT no está registrado como cliente, el plan se muestra como "Rezagado" o "MetLife".
- **Hoy:** la nueva atención permite dar de alta al afiliado en el momento (RUT y nombre) y, sin planes vigentes,
  solo ofrece REZAGADO o METLIFE.
- **Alternativas:**
  - **A.** Mantener el alta rápida (el afiliado queda registrado sin plan). *Recomendada:* deja trazabilidad del RUT.
  - **B.** Atender sin registrar al afiliado (solo RUT y nombre en la atención).
  - **C.** Prohibir atenciones a RUT no registrados.

## 2. Formato oficial de carga "SGC-RG-OP-004"

- **Anexo (§III l.192 y l.224):** la nómina se edita al formato "SGC-RG-OP-004 CARGA MASIVA"; los 5 primeros campos
  son obligatorios.
- **Hoy:** se cargan planillas con columnas propias; obligatorios RUT, nombres y apellido paterno; la fecha de inicio
  toma la de hoy si falta.
- **Necesitamos:** una planilla de ejemplo del formato (con 2–3 filas ficticias) y cuáles son sus 5 campos
  obligatorios. Con eso se agrega el formato como plantilla de carga.

## 3. Reporte por canal: ¿atenciones "posteriores" o "dentro" de la vigencia?

- **Anexo (§XII l.2061):** "mostrará las atenciones en que la fecha de consulta sea **posterior a la fecha de término**
  de vigencia del rut y plan". El reporte por plan, en cambio, pide las atenciones *dentro* de la vigencia.
- **Hoy:** el reporte por canal usa la misma regla que el de plan (dentro de la vigencia).
- **Alternativas:**
  - **A.** Dentro de la vigencia (como hoy). *Recomendada:* parece un error de redacción del Anexo.
  - **B.** Después del término de la vigencia (atenciones de clientes que ya no tienen el plan).
  - **C.** Ambos, en hojas separadas.

## 4. Fórmula de la tasa de uso

- **Anexo (§XII–XIII):** los reportes muestran la "tasa de uso", sin definirla.
- **Hoy:** atenciones del período ÷ afiliados vigentes del período (marcada en pantalla como "a validar").
- **Alternativas:**
  - **A.** Atenciones ÷ afiliados vigentes (como hoy).
  - **B.** RUT distintos atendidos ÷ afiliados vigentes (cuánta gente usó el plan). *Recomendada* si el objetivo es
    medir penetración del producto.
  - **C.** Otra (por favor, la fórmula exacta).

## 5. Exportación de búsquedas: ¿los abogados son "área servicios"?

- **Anexo (§XI ~l.1858):** las búsquedas exportables son para el Administrador y el área servicios.
- **Hoy:** exportar exige el permiso "Exportar datos a planilla", que el perfil Abogado no tiene.
- **Alternativas:**
  - **A.** Los abogados no exportan (como hoy). *Recomendada* por protección de datos (Ley 19.628).
  - **B.** Los abogados exportan solo sus propias atenciones (el alcance ya lo limita).
- Es un cambio de configuración del perfil (Administración → Perfiles), sin desarrollo.

## 6. Comité obligatorio al terminar con riesgo ≥ 20

- **Anexo (§VIII l.1196 y l.1217):** "una vez que AJJ saca de comité el correlativo … o para aquellos casos con valor
  de riesgo menor a 20, AR deberá cambiar el estado a Terminado".
- **Hoy:** el riesgo (materia + cuantía + cliente, 0–10 cada uno) se registra y el comité se exige al **abandonar** con
  riesgo ≥ 20; al **terminar** no se exige "Revisado por comité".
- **Alternativas:**
  - **A.** Exigir "Revisado por comité" también al terminar un juicio con riesgo ≥ 20. *Recomendada:* es lo que dice el
    Anexo.
  - **B.** Mantener como hoy.
- También confirmar la escala de 0 a 10 por factor (umbral 20 sobre 30).

## 7. "Área servicios", "área" del Controller de usuarios y sedes

- **Anexo:** el Controller de usuarios filtra por "Usuario, Perfil, Cargo, **Área**, Plan, Canal" (§XIII l.2500) y los
  procedimientos aplican a "casa central, sedes regionales y red nacional" (§VII l.710).
- **Hoy:** existen perfil, cargo y jefatura (equipo); no existen "área" ni "sede".
- **Alternativas:**
  - **A.** Agregar "Área" y "Sede" como maestros y asignarlos a cada usuario (filtros en reportes y controller).
    *Recomendada* si la organización realmente se gestiona por áreas o sedes.
  - **B.** Usar el cargo y la jefatura como hoy.
- Si eligen A: por favor envíen la lista de áreas y de sedes.

## 8. Coberturas complementarias

- **Anexo (§I l.118):** el módulo de planes incluye "coberturas complementarias".
- **Hoy:** cada plan tiene reglas de cobertura (general, por tipo, por materia, por materia y tipo). No existe el
  concepto "complementaria".
- **Necesitamos:** un ejemplo concreto (¿un seguro adicional como MetLife que suma cobertura a otro plan? ¿un plan
  "agregado" que mejora el copago?) para modelarlo.

## 9. Aprobación de jefatura de la solicitud inicial de provisión

- **Anexo (§VIII l.1065):** "Una vez aprobada la provisión ingresada (AJJ), PSL notificará al área de finanzas".
  En el flujo de provisiones (§X) la aprobación de jefatura está en la **entrega** de fondos.
- **Hoy:** la provisión pasa de Solicitada a Pagada (pago del cliente) sin aprobación; la jefatura aprueba la entrega.
- **Alternativas:**
  - **A.** Mantener como hoy (aprobación en la entrega). *Recomendada:* evita doble aprobación.
  - **B.** Agregar aprobación de jefatura antes de avisar a Finanzas (Solicitada → Aprobada → Pagada).

## 10. Planes no vigentes en el formulario de nueva atención

- **Anexo:** el plan no vigente "no aparece en la baraja de planes del rut" (§I l.121), pero en la consulta se pide
  mostrar la vigencia de los planes del cliente (§VI l.514).
- **Hoy:** se muestran deshabilitados con la marca "(no vigente)"; no se pueden elegir.
- **Alternativas:**
  - **A.** Mantenerlos visibles y deshabilitados (como hoy). *Recomendada:* el abogado ve por qué no puede usarlos.
  - **B.** Ocultarlos por completo.

## 11. ¿El tramitador ve todas las asesorías y juicios?

- **Anexo (§IV l.382):** el tramitador edita gestiones de asesorías y juicios.
- **Hoy:** ve las atenciones que creó o donde tiene una gestión asignada.
- **Alternativas:**
  - **A.** Que vea todas las atenciones (permiso "Ver todas las atenciones" en su perfil).
  - **B.** Que vea las de su equipo (permiso "Ver atenciones de su equipo").
  - **C.** Como hoy. *Recomendada* hasta confirmar la carga real de trabajo.
- Es configuración de perfiles, sin desarrollo.

---

## Lo que además necesitamos recibir (no son decisiones)

| Para | Qué | Quién |
|---|---|---|
| Desplegar en AWS | Cuenta AWS, dominio y certificado | TI LegalChile |
| Ingreso con Microsoft | Registro de la aplicación en Entra ID (clientId, ámbito de la API) | TI LegalChile |
| Correos reales | Configuración de Amazon SES (dominio verificado) y casillas `aprueba.arancel@`, `solicitud.fondos@`, `autoriza.provision@`, `operaciones@` | TI LegalChile |
| Migración | Acceso (o respaldo) del SQL Server 2008 actual | TI LegalChile |
| WebPay real | Contrato y credenciales de Transbank | Finanzas |
| Grabaciones | Proveedor y API de la central telefónica | TI / Operaciones |
| Formularios | "Formulario de Antecedentes Requeridos", cuestionario de divorcio y formularios del Registro Civil | Área legal |
| Puesta en marcha | Fechas de capacitación por perfil | Gerencia de Servicios |
