-- atenciones.correlativo dejó de ser unique global porque el generador
-- siguienteCorrelativo() emite el mismo string para tenants distintos
-- (CONS-2026-000001 puede aparecer en cada plan). El invariante real es
-- "correlativo único por plan", por eso lo reemplazamos por un índice
-- compuesto.

ALTER TABLE atenciones DROP CONSTRAINT IF EXISTS atenciones_correlativo_unique;
CREATE UNIQUE INDEX IF NOT EXISTS atenciones_plan_correlativo_uq
  ON atenciones (cod_plan, correlativo);
