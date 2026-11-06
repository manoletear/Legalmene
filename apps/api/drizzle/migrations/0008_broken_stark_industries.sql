-- Paso 2 (Anexo PSL): maestros administrables, aranceles por materia y coberturas por plan.
-- Los datos existentes se migran antes de eliminar columnas.

CREATE TYPE "public"."modalidad_cobertura" AS ENUM('Porcentaje', 'ValorUF', 'SinCobertura');--> statement-breakpoint
CREATE TABLE "calidades_procesales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "causas_termino" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"aplica_consulta" boolean DEFAULT true NOT NULL,
	"aplica_asesoria" boolean DEFAULT true NOT NULL,
	"aplica_juicio" boolean DEFAULT true NOT NULL,
	"requiere_provision" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organismos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"nombre" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipos_consulta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tribunales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"region" varchar(80),
	"comuna" varchar(80)
);
--> statement-breakpoint
CREATE TABLE "coberturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"materia_id" uuid,
	"tipo" "tipo_atencion",
	"modalidad" "modalidad_cobertura" NOT NULL,
	"porcentaje" integer,
	"valor_uf_centesimas" integer,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coberturas_regla_uq" UNIQUE NULLS NOT DISTINCT("cod_plan","materia_id","tipo")
);
--> statement-breakpoint

-- Índices únicos de maestros antes de poblarlos (los INSERT usan ON CONFLICT).
CREATE UNIQUE INDEX "calidades_procesales_nombre_uq" ON "calidades_procesales" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "causas_termino_nombre_uq" ON "causas_termino" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "competencias_nombre_uq" ON "competencias" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "materias_competencia_nombre_uq" ON "materias" USING btree ("competencia_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "organismos_nombre_uq" ON "organismos" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "procedimientos_competencia_nombre_uq" ON "procedimientos" USING btree ("competencia_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_consulta_nombre_uq" ON "tipos_consulta" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "tribunales_nombre_uq" ON "tribunales" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "tribunales_region_idx" ON "tribunales" USING btree ("region");--> statement-breakpoint
CREATE INDEX "coberturas_plan_idx" ON "coberturas" USING btree ("cod_plan");--> statement-breakpoint
ALTER TABLE "materias" ADD CONSTRAINT "materias_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedimientos" ADD CONSTRAINT "procedimientos_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_materia_id_materias_id_fk" FOREIGN KEY ("materia_id") REFERENCES "public"."materias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- 1) Una competencia por cada valor del enum legado.
INSERT INTO "competencias" ("nombre")
SELECT unnest(enum_range(NULL::"competencia"))::text
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2) El trigger de búsqueda depende de las columnas que cambian: se reemplaza.
DROP TRIGGER IF EXISTS atenciones_search_vector_trg ON atenciones;--> statement-breakpoint

-- 3) Aranceles: pasan de "por plan" a "por materia". Cada descripción se vuelve una
--    materia de su competencia.
ALTER TABLE "aranceles" DROP CONSTRAINT "aranceles_cod_plan_planes_cod_plan_fk";--> statement-breakpoint
DROP INDEX "aranceles_plan_codigo_uq";--> statement-breakpoint
DROP INDEX "aranceles_plan_competencia_idx";--> statement-breakpoint
ALTER TABLE "aranceles" ADD COLUMN "materia_id" uuid;--> statement-breakpoint
INSERT INTO "materias" ("competencia_id", "nombre")
SELECT DISTINCT c.id, a.descripcion
FROM aranceles a JOIN competencias c ON c.nombre = a.competencia::text
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE aranceles a SET materia_id = m.id
FROM competencias c, materias m
WHERE c.nombre = a.competencia::text AND m.competencia_id = c.id AND m.nombre = a.descripcion;
--> statement-breakpoint

-- 4) Atenciones: competencia (enum) → competencia_id; materia (texto) → asunto.
ALTER TABLE "atenciones" DROP CONSTRAINT "atenciones_arancel_id_aranceles_id_fk";--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "competencia_id" uuid;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "materia_id" uuid;--> statement-breakpoint
UPDATE atenciones t SET competencia_id = c.id FROM competencias c WHERE c.nombre = t.competencia::text;
--> statement-breakpoint
-- Si la atención tenía arancel asignado de su misma competencia, hereda esa materia.
UPDATE atenciones t SET materia_id = a.materia_id
FROM aranceles a, competencias c
WHERE t.arancel_id = a.id AND c.nombre = a.competencia::text AND c.id = t.competencia_id;
--> statement-breakpoint
-- El resto queda en la materia "General" de su competencia.
INSERT INTO "materias" ("competencia_id", "nombre")
SELECT DISTINCT competencia_id, 'General' FROM atenciones WHERE materia_id IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE atenciones t SET materia_id = m.id
FROM materias m WHERE t.materia_id IS NULL AND m.competencia_id = t.competencia_id AND m.nombre = 'General';
--> statement-breakpoint
ALTER TABLE "atenciones" ALTER COLUMN "competencia_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "atenciones" ALTER COLUMN "materia_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "atenciones" RENAME COLUMN "materia" TO "asunto";--> statement-breakpoint
ALTER INDEX IF EXISTS "atenciones_materia_trgm_idx" RENAME TO "atenciones_asunto_trgm_idx";--> statement-breakpoint
ALTER TABLE "atenciones" DROP COLUMN "competencia";--> statement-breakpoint
ALTER TABLE "atenciones" DROP COLUMN "arancel_id";--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_materia_id_materias_id_fk" FOREIGN KEY ("materia_id") REFERENCES "public"."materias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atenciones_materia_idx" ON "atenciones" USING btree ("materia_id");--> statement-breakpoint

-- 5) Aranceles duplicados entre planes: se conserva el más antiguo por código y por
--    materia/tipo (el arancel ahora es único para todos los planes).
DELETE FROM aranceles WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY codigo ORDER BY created_at, id) AS rn FROM aranceles
  ) x WHERE rn > 1
);
--> statement-breakpoint
DELETE FROM aranceles WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY materia_id, tipo ORDER BY created_at, id) AS rn
    FROM aranceles
  ) x WHERE rn > 1
);
--> statement-breakpoint
ALTER TABLE "aranceles" ALTER COLUMN "materia_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "aranceles" DROP COLUMN "cod_plan";--> statement-breakpoint
ALTER TABLE "aranceles" DROP COLUMN "competencia";--> statement-breakpoint
ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_materia_id_materias_id_fk" FOREIGN KEY ("materia_id") REFERENCES "public"."materias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aranceles_codigo_uq" ON "aranceles" USING btree ("codigo");--> statement-breakpoint
ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_materia_tipo_uq" UNIQUE NULLS NOT DISTINCT("materia_id","tipo");--> statement-breakpoint
DROP TYPE "public"."competencia";--> statement-breakpoint

-- 6) Búsqueda full-text con el asunto y el nombre de la competencia.
CREATE OR REPLACE FUNCTION atenciones_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('spanish', coalesce(NEW.correlativo, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.asunto, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.descripcion, '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(
      (SELECT m.nombre || ' ' || c.nombre FROM materias m JOIN competencias c ON c.id = m.competencia_id WHERE m.id = NEW.materia_id),
      '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER atenciones_search_vector_trg
  BEFORE INSERT OR UPDATE OF correlativo, asunto, descripcion, materia_id
  ON atenciones FOR EACH ROW EXECUTE FUNCTION atenciones_search_vector_update();
--> statement-breakpoint
UPDATE atenciones SET correlativo = correlativo;
