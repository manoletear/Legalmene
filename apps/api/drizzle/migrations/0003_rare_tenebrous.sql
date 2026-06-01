-- Auto-generado por db:generate después de cambiar el schema en la migración 0002.
-- 0002 ya aplicó este cambio en bases ya migradas, pero el snapshot Drizzle quedó
-- desincronizado. Esta migración deja el journal correcto y es idempotente para
-- entornos nuevos.

ALTER TABLE "atenciones" DROP CONSTRAINT IF EXISTS "atenciones_correlativo_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "atenciones_plan_correlativo_uq" ON "atenciones" USING btree ("cod_plan","correlativo");
