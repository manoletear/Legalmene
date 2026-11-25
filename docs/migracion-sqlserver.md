# Migración SQL Server 2008 → NEXUS (PostgreSQL / Aurora)

Guía operativa para cuando LegalChile entregue acceso (o un respaldo `.bak`) del sistema actual. Complementa el
plan de alto nivel de `docs/propuesta-arquitectura-legalchile.md` §4. **No contiene nombres de tablas del sistema
antiguo:** se completan con el inventario del paso 1.

## Principios

- El esquema de NEXUS no se cambia para parecerse al antiguo: los datos se **transforman** al modelo nuevo.
- Las reglas de negocio no se cargan como SQL: los datos entran por los mismos servicios que usa la aplicación
  (cargas masivas FLUJO/STOCK) o por scripts que respetan sus invariantes (correlativos, RUT normalizado,
  estados válidos, eventos de flujo).
- Ningún dato real se carga en la demo ni en ambientes compartidos; el ensayo se hace en un ambiente aislado.
- Ley 19.628: los extractos viajan cifrados y se borran al terminar; nada queda en el repositorio.

## 1. Inventario del sistema antiguo (correr en el SQL Server)

```sql
-- Tablas con su volumen
SELECT s.name AS esquema, t.name AS tabla, SUM(p.rows) AS filas
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY s.name, t.name ORDER BY filas DESC;

-- Columnas, tipos y nulabilidad
SELECT t.name AS tabla, c.name AS columna, ty.name AS tipo, c.max_length, c.is_nullable
FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id ORDER BY t.name, c.column_id;

-- Llaves foráneas
SELECT fk.name, tp.name AS tabla, cp.name AS columna, tr.name AS referencia, cr.name AS columna_ref
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables tp ON tp.object_id = fkc.parent_object_id
JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
JOIN sys.tables tr ON tr.object_id = fkc.referenced_object_id
JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id;

-- Procedimientos, vistas, triggers y jobs (la lógica que hay que reescribir o descartar)
SELECT type_desc, name FROM sys.objects WHERE type IN ('P', 'V', 'TR', 'FN', 'IF', 'TF') ORDER BY type_desc, name;
SELECT name, enabled FROM msdb.dbo.sysjobs;

-- Collation y valores de texto con problemas de codificación
SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation');
```

Guardar los resultados como planilla (no en el repositorio) y completar la tabla de mapeo del paso 2.

## 2. Mapeo (completar con el inventario)

| Entidad NEXUS | Tabla/s de origen | Clave de cruce | Transformación | Vía de carga |
|---|---|---|---|---|
| `planes`, `canales` | | código de plan | nombre, canal, vigencia | script + revisión manual |
| `afiliados` | | RUT (`formatearRut()`) | nombres, contacto, región/ciudad/comuna como texto | carga masiva `afiliados` (STOCK) |
| `planes_afiliado` | | RUT + plan | fecha inicio/término, vigencia | carga masiva `afiliados` |
| `cargas_afiliado`, `bienes_afiliado` | | RUT titular + plan | | cargas masivas `cargas`, `bienes` |
| Maestros (competencias, materias, tribunales…) | | nombre | normalizar tildes y mayúsculas; desactivar los obsoletos | Maestros (pantalla o script) |
| `aranceles`, `coberturas` | | materia (+ tipo) | UF × 100 | carga masiva `coberturas` + script de aranceles |
| `atenciones` | | correlativo antiguo | tipo, estado (tabla de equivalencias), fechas en hora de Chile | script de importación (ver 3) |
| `gestiones`, `comites` | | correlativo | estado, responsable por correo | script |
| `provisiones`, movimientos, aranceles por atención | | correlativo | montos en pesos; estados por equivalencia | script con eventos de flujo |
| `documentos` | | correlativo | binarios a S3 (`documentos/` + clave por atención) | script + `aws s3 sync` |
| Usuarios | | correo | perfil por equivalencia; `entra_oid = enlace:<correo>` | `POST /admin/usuarios` |

**Equivalencias de estado:** hacer una tabla "estado antiguo → estado NEXUS" por flujo (atención, arancel,
provisión, gestión). Un estado sin equivalencia detiene la carga de esa fila (se reporta, no se adivina).

## 3. Orden de carga

1. Maestros → planes y canales → aranceles y coberturas.
2. Usuarios y perfiles (jefaturas antes que equipos).
3. Afiliados y relaciones RUT–plan (STOCK); cargas y bienes.
4. Atenciones históricas: se conserva el **correlativo antiguo** en `metadata.correlativoLegado` y se emite
   correlativo NEXUS con `siguienteCorrelativo()`; las cerradas entran directo en su estado final con sus fechas.
5. Gestiones, comités y compromisos de cada atención.
6. Finanzas por atención (arancel, provisiones, movimientos, rendiciones) con su fila de eventos.
7. Documentos a S3 y registro en `documentos` con su `tipo`.
8. Ajuste de secuencias de `correlativos` al máximo cargado por tipo y año.

## 4. Validación (antes del corte)

- Conteo de filas por entidad: origen vs destino (diferencia explicada fila a fila).
- Sumas de control: montos de provisiones y aranceles pagados por año; atenciones por tipo, estado y año.
- RUT: 0 duplicados tras `formatearRut()`; RUT con dígito verificador inválido listados para corrección.
- Muestra de 30 atenciones revisadas en pantalla por usuarios de LegalChile (ficha antigua vs nueva).
- Reportes por plan y canal de un mes cerrado: mismas cifras que el sistema antiguo (o diferencia explicada).

## 5. Corte

Sigue la Fase 3 de la propuesta (congelar escrituras, última sincronización, validación, pruebas de humo,
apertura). Plan de vuelta atrás: el sistema antiguo queda en solo lectura durante 30 días.

## Lo que se necesita de LegalChile

- Acceso de solo lectura al SQL Server 2008 (o un `.bak` reciente) en un ambiente aislado.
- Una persona que conozca el sistema actual para validar las equivalencias de estado.
- Ventana de corte acordada (fin de semana) y responsables de las pruebas de humo.
