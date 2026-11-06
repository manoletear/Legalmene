-- Modelo núcleo (Anexo PSL): el plan deja de ser tenant.
--   * afiliados pasa a ser la persona, única por RUT.
--   * planes_afiliado guarda la relación RUT–Plan con su vigencia.
--   * correlativos de atención pasan a ser únicos globales por tipo/año.
--   * provisiones deriva el plan desde su atención.
-- Los datos existentes se migran antes de eliminar columnas.

CREATE TABLE "canales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "canales_nombre_uq" ON "canales" USING btree ("nombre");--> statement-breakpoint
ALTER TABLE "planes" ADD COLUMN "canal_id" uuid;--> statement-breakpoint
ALTER TABLE "planes" ADD CONSTRAINT "planes_canal_id_canales_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "planes_afiliado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"afiliado_id" uuid NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_termino" date,
	"vigencia" "vigencia_afiliado" DEFAULT 'Activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planes_afiliado" ADD CONSTRAINT "planes_afiliado_afiliado_id_afiliados_id_fk" FOREIGN KEY ("afiliado_id") REFERENCES "public"."afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planes_afiliado" ADD CONSTRAINT "planes_afiliado_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planes_afiliado_afiliado_plan_uq" ON "planes_afiliado" USING btree ("afiliado_id","cod_plan");--> statement-breakpoint
CREATE INDEX "planes_afiliado_plan_vigencia_idx" ON "planes_afiliado" USING btree ("cod_plan","vigencia");--> statement-breakpoint

-- Por cada RUT se conserva la fila actualizada más recientemente (desempate por id).
CREATE TEMP TABLE afiliado_keep ON COMMIT DROP AS
SELECT id,
       first_value(id) OVER (PARTITION BY rut ORDER BY updated_at DESC, id DESC) AS keep_id
FROM afiliados;
--> statement-breakpoint
INSERT INTO "planes_afiliado" (afiliado_id, cod_plan, fecha_inicio, fecha_termino, vigencia, created_at, updated_at)
SELECT k.keep_id,
       a.cod_plan,
       (a.fecha_ingreso AT TIME ZONE 'America/Santiago')::date,
       (a.fecha_egreso AT TIME ZONE 'America/Santiago')::date,
       a.vigencia,
       a.created_at,
       a.updated_at
FROM afiliados a
JOIN afiliado_keep k ON k.id = a.id;
--> statement-breakpoint
UPDATE atenciones t SET afiliado_id = k.keep_id
FROM afiliado_keep k WHERE t.afiliado_id = k.id AND k.id <> k.keep_id;
--> statement-breakpoint
UPDATE pagos t SET afiliado_id = k.keep_id
FROM afiliado_keep k WHERE t.afiliado_id = k.id AND k.id <> k.keep_id;
--> statement-breakpoint
-- La persona queda Activa si alguno de sus registros por plan lo estaba.
UPDATE afiliados SET vigencia = 'Activo'
WHERE id IN (
  SELECT k.keep_id FROM afiliado_keep k JOIN afiliados a ON a.id = k.id WHERE a.vigencia = 'Activo'
);
--> statement-breakpoint
DELETE FROM afiliados WHERE id IN (SELECT id FROM afiliado_keep WHERE id <> keep_id);
--> statement-breakpoint
ALTER TABLE "afiliados" DROP CONSTRAINT "afiliados_cod_plan_planes_cod_plan_fk";--> statement-breakpoint
DROP INDEX "afiliados_rut_plan_uq";--> statement-breakpoint
DROP INDEX "afiliados_plan_vigencia_idx";--> statement-breakpoint
ALTER TABLE "afiliados" DROP COLUMN "cod_plan";--> statement-breakpoint
ALTER TABLE "afiliados" DROP COLUMN "fecha_ingreso";--> statement-breakpoint
ALTER TABLE "afiliados" DROP COLUMN "fecha_egreso";--> statement-breakpoint
CREATE UNIQUE INDEX "afiliados_rut_uq" ON "afiliados" USING btree ("rut");--> statement-breakpoint

-- Correlativos repetidos entre planes: el más antiguo conserva su número y los
-- demás reciben números nuevos a continuación del máximo de su tipo/año.
WITH parsed AS (
  SELECT id, correlativo, created_at,
         split_part(correlativo, '-', 1) AS pre,
         split_part(correlativo, '-', 2) AS anio,
         row_number() OVER (PARTITION BY correlativo ORDER BY created_at, id) AS rn
  FROM atenciones
  WHERE correlativo ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
),
maxes AS (
  SELECT pre, anio, max(split_part(correlativo, '-', 3)::int) AS mx FROM parsed GROUP BY pre, anio
),
dups AS (
  SELECT id, pre, anio, row_number() OVER (PARTITION BY pre, anio ORDER BY created_at, id) AS k
  FROM parsed WHERE rn > 1
)
UPDATE atenciones a
SET correlativo = d.pre || '-' || d.anio || '-' || lpad((m.mx + d.k)::text, 6, '0')
FROM dups d JOIN maxes m USING (pre, anio)
WHERE a.id = d.id;
--> statement-breakpoint
DROP INDEX "atenciones_plan_correlativo_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "atenciones_correlativo_uq" ON "atenciones" USING btree ("correlativo");--> statement-breakpoint

-- Secuencias por tipo/año: valor.next = último número emitido + 1.
DROP INDEX "correlativos_pk";--> statement-breakpoint
DELETE FROM "correlativos";--> statement-breakpoint
ALTER TABLE "correlativos" DROP COLUMN "cod_plan";--> statement-breakpoint
INSERT INTO "correlativos" (tipo, anio, valor)
SELECT tipo, split_part(correlativo, '-', 2), jsonb_build_object('next', max(split_part(correlativo, '-', 3)::int) + 1)
FROM atenciones
WHERE correlativo ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
GROUP BY tipo, split_part(correlativo, '-', 2);
--> statement-breakpoint
CREATE UNIQUE INDEX "correlativos_tipo_anio_uq" ON "correlativos" USING btree ("tipo","anio");--> statement-breakpoint

ALTER TABLE "provisiones" DROP CONSTRAINT "provisiones_cod_plan_planes_cod_plan_fk";--> statement-breakpoint
DROP INDEX "provisiones_plan_estado_idx";--> statement-breakpoint
ALTER TABLE "provisiones" DROP COLUMN "cod_plan";--> statement-breakpoint
CREATE INDEX "provisiones_estado_idx" ON "provisiones" USING btree ("estado");
