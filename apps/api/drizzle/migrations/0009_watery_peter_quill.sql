-- Paso 3a (Anexo PSL): estados por tipo de atención, datos de consulta y de juicio,
-- derivaciones con aprobación, contrapartes y gestiones predefinidas.
-- Los estados legados se mapean antes de recrear el enum.

CREATE TYPE "public"."canal_contacto" AS ENUM('Telefonico', 'Presencial', 'Email', 'Chat', 'Videoconferencia');--> statement-breakpoint
CREATE TYPE "public"."estado_derivacion" AS ENUM('Solicitada', 'Aprobada', 'Rechazada');--> statement-breakpoint
CREATE TYPE "public"."moneda_cuantia" AS ENUM('CLP', 'UF', 'UTM', 'USD');--> statement-breakpoint
CREATE TABLE "contrapartes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"rut" varchar(12),
	"representante_legal" varchar(200),
	"abogado_nombre" varchar(200),
	"abogado_email" varchar(200),
	"abogado_telefono" varchar(30),
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derivaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consulta_id" uuid NOT NULL,
	"nuevo_tipo" "tipo_atencion" NOT NULL,
	"motivo" text NOT NULL,
	"estado" "estado_derivacion" DEFAULT 'Solicitada' NOT NULL,
	"solicitada_por_id" uuid NOT NULL,
	"resuelta_por_id" uuid,
	"observacion" text,
	"atencion_derivada_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gestiones_plantilla" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"materia_id" uuid,
	"procedimiento_id" uuid,
	"orden" integer NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"tipo" "tipo_gestion" NOT NULL,
	"plazo_dias_habiles" integer NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atenciones" ALTER COLUMN "estado" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "canal_contacto" "canal_contacto";--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "tipo_consulta_id" uuid;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "codigo_grabacion" varchar(120);--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "hora_inicio" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "hora_termino" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "respuesta" text;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "organismo_id" uuid;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "procedimiento_id" uuid;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "tribunal_id" uuid;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "rol_causa" varchar(60);--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "ruc" varchar(60);--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "cuantia_monto" integer;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "cuantia_moneda" "moneda_cuantia";--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "calidad_procesal_id" uuid;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "riesgo_materia" smallint;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "riesgo_cuantia" smallint;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "riesgo_cliente" smallint;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "revisado_por_comite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "causa_termino_id" uuid;--> statement-breakpoint
ALTER TABLE "gestiones" ADD COLUMN "plantilla_id" uuid;--> statement-breakpoint
ALTER TABLE "contrapartes" ADD CONSTRAINT "contrapartes_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivaciones" ADD CONSTRAINT "derivaciones_consulta_id_atenciones_id_fk" FOREIGN KEY ("consulta_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivaciones" ADD CONSTRAINT "derivaciones_solicitada_por_id_usuarios_id_fk" FOREIGN KEY ("solicitada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivaciones" ADD CONSTRAINT "derivaciones_resuelta_por_id_usuarios_id_fk" FOREIGN KEY ("resuelta_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivaciones" ADD CONSTRAINT "derivaciones_atencion_derivada_id_atenciones_id_fk" FOREIGN KEY ("atencion_derivada_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gestiones_plantilla" ADD CONSTRAINT "gestiones_plantilla_materia_id_materias_id_fk" FOREIGN KEY ("materia_id") REFERENCES "public"."materias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gestiones_plantilla" ADD CONSTRAINT "gestiones_plantilla_procedimiento_id_procedimientos_id_fk" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contrapartes_atencion_idx" ON "contrapartes" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "derivaciones_consulta_idx" ON "derivaciones" USING btree ("consulta_id");--> statement-breakpoint
CREATE INDEX "derivaciones_estado_idx" ON "derivaciones" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "gestiones_plantilla_materia_idx" ON "gestiones_plantilla" USING btree ("materia_id");--> statement-breakpoint
CREATE INDEX "gestiones_plantilla_procedimiento_idx" ON "gestiones_plantilla" USING btree ("procedimiento_id");--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_tipo_consulta_id_tipos_consulta_id_fk" FOREIGN KEY ("tipo_consulta_id") REFERENCES "public"."tipos_consulta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_organismo_id_organismos_id_fk" FOREIGN KEY ("organismo_id") REFERENCES "public"."organismos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_procedimiento_id_procedimientos_id_fk" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_tribunal_id_tribunales_id_fk" FOREIGN KEY ("tribunal_id") REFERENCES "public"."tribunales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_calidad_procesal_id_calidades_procesales_id_fk" FOREIGN KEY ("calidad_procesal_id") REFERENCES "public"."calidades_procesales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_causa_termino_id_causas_termino_id_fk" FOREIGN KEY ("causa_termino_id") REFERENCES "public"."causas_termino"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gestiones" ADD CONSTRAINT "gestiones_plantilla_id_gestiones_plantilla_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."gestiones_plantilla"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gestiones_atencion_plantilla_uq" ON "gestiones" USING btree ("atencion_id","plantilla_id");--> statement-breakpoint
ALTER TABLE "public"."atenciones" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
-- Estados legados → estados del Anexo (una consulta "Abierta" está Iniciada; una asesoría
-- o juicio "Abierta" está Pendiente). Suspendida pasa a espera de antecedentes.
UPDATE "atenciones" a SET "estado" = CASE
  WHEN "estado" = 'Abierta' AND "tipo" = 'Consulta' THEN 'Iniciada'
  WHEN "estado" = 'Abierta' THEN 'Pendiente'
  WHEN "estado" = 'EnGestion' AND "tipo" = 'Consulta' THEN 'Iniciada'
  WHEN "estado" = 'EnComite' AND "tipo" = 'Consulta' THEN 'Iniciada'
  WHEN "estado" = 'Suspendida' AND "tipo" = 'Consulta' THEN 'Iniciada'
  WHEN "estado" = 'Suspendida' THEN 'EnEsperaAntecedentes'
  WHEN "estado" IN ('Cerrada', 'Archivada') AND "tipo" = 'Consulta'
    AND EXISTS (SELECT 1 FROM "atenciones" d WHERE d."metadata"->>'derivadaDe' = a."id"::text) THEN 'Derivada'
  WHEN "estado" IN ('Cerrada', 'Archivada') THEN 'Terminada'
  ELSE "estado"
END;--> statement-breakpoint
-- Consultas existentes: la hora de inicio es la apertura y la de término el cierre.
UPDATE "atenciones" SET "hora_inicio" = "fecha_apertura" WHERE "tipo" = 'Consulta' AND "hora_inicio" IS NULL;--> statement-breakpoint
UPDATE "atenciones" SET "hora_termino" = "fecha_cierre" WHERE "tipo" = 'Consulta' AND "fecha_cierre" IS NOT NULL AND "hora_termino" IS NULL;--> statement-breakpoint
DROP TYPE "public"."estado_atencion";--> statement-breakpoint
CREATE TYPE "public"."estado_atencion" AS ENUM('Iniciada', 'Respondida', 'Derivada', 'Asignada', 'Pendiente', 'EnGestion', 'EnEsperaAntecedentes', 'EnEsperaArancel', 'EnEsperaProvision', 'EnComite', 'Terminada', 'Abandonada');--> statement-breakpoint
ALTER TABLE "public"."atenciones" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_atencion" USING "estado"::"public"."estado_atencion";