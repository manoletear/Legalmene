CREATE TYPE "public"."parentesco" AS ENUM('Conyuge', 'ConvivienteCivil', 'Hijo', 'Padre', 'Madre', 'Otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_bien" AS ENUM('Inmueble', 'Vehiculo', 'Otro');--> statement-breakpoint
CREATE TYPE "public"."calidad_heredero" AS ENUM('Conyuge', 'ConvivienteCivil', 'Hijo', 'Padre', 'Madre', 'Hermano', 'Otro');--> statement-breakpoint
ALTER TYPE "public"."estado_atencion" ADD VALUE 'Ingresada';--> statement-breakpoint
ALTER TYPE "public"."estado_atencion" ADD VALUE 'EnPreparacion';--> statement-breakpoint
ALTER TYPE "public"."estado_atencion" ADD VALUE 'DocumentosPendientes';--> statement-breakpoint
ALTER TYPE "public"."estado_atencion" ADD VALUE 'ListaEmision';--> statement-breakpoint
ALTER TYPE "public"."tipo_atencion" ADD VALUE 'PosesionEfectiva';--> statement-breakpoint
CREATE TABLE "bienes_afiliado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"afiliado_id" uuid NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"tipo" "tipo_bien" NOT NULL,
	"identificador" varchar(60) NOT NULL,
	"descripcion" text,
	"comuna" varchar(80),
	"fecha_inicio" date NOT NULL,
	"fecha_termino" date,
	"vigencia" "vigencia_afiliado" DEFAULT 'Activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargas_afiliado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"afiliado_id" uuid NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"rut" varchar(12) NOT NULL,
	"nombres" varchar(120) NOT NULL,
	"apellido_paterno" varchar(80) NOT NULL,
	"apellido_materno" varchar(80),
	"parentesco" "parentesco",
	"fecha_nacimiento" date,
	"fecha_inicio" date NOT NULL,
	"fecha_termino" date,
	"vigencia" "vigencia_afiliado" DEFAULT 'Activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herederos_posesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"rut" varchar(12) NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"calidad" "calidad_heredero" NOT NULL,
	"domicilio" varchar(250),
	"email" varchar(200),
	"telefono" varchar(30),
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posesiones_efectivas" (
	"atencion_id" uuid PRIMARY KEY NOT NULL,
	"causante_rut" varchar(12),
	"causante_nombre" varchar(200),
	"causante_fecha_defuncion" date,
	"causante_ultimo_domicilio" varchar(250),
	"causante_comuna" varchar(80),
	"observaciones" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "carga_id" uuid;--> statement-breakpoint
ALTER TABLE "bienes_afiliado" ADD CONSTRAINT "bienes_afiliado_afiliado_id_afiliados_id_fk" FOREIGN KEY ("afiliado_id") REFERENCES "public"."afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bienes_afiliado" ADD CONSTRAINT "bienes_afiliado_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargas_afiliado" ADD CONSTRAINT "cargas_afiliado_afiliado_id_afiliados_id_fk" FOREIGN KEY ("afiliado_id") REFERENCES "public"."afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargas_afiliado" ADD CONSTRAINT "cargas_afiliado_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herederos_posesion" ADD CONSTRAINT "herederos_posesion_atencion_id_posesiones_efectivas_atencion_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."posesiones_efectivas"("atencion_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posesiones_efectivas" ADD CONSTRAINT "posesiones_efectivas_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bienes_afiliado_titular_plan_bien_uq" ON "bienes_afiliado" USING btree ("afiliado_id","cod_plan","tipo","identificador");--> statement-breakpoint
CREATE INDEX "bienes_afiliado_identificador_idx" ON "bienes_afiliado" USING btree ("identificador");--> statement-breakpoint
CREATE INDEX "bienes_afiliado_plan_idx" ON "bienes_afiliado" USING btree ("cod_plan","vigencia");--> statement-breakpoint
CREATE UNIQUE INDEX "cargas_afiliado_titular_plan_rut_uq" ON "cargas_afiliado" USING btree ("afiliado_id","cod_plan","rut");--> statement-breakpoint
CREATE INDEX "cargas_afiliado_rut_idx" ON "cargas_afiliado" USING btree ("rut");--> statement-breakpoint
CREATE INDEX "cargas_afiliado_plan_idx" ON "cargas_afiliado" USING btree ("cod_plan","vigencia");--> statement-breakpoint
CREATE INDEX "herederos_posesion_atencion_idx" ON "herederos_posesion" USING btree ("atencion_id");--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_carga_id_cargas_afiliado_id_fk" FOREIGN KEY ("carga_id") REFERENCES "public"."cargas_afiliado"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Posesión efectiva (paso 5b): la crean los perfiles que ya creaban asesorías y juicios.
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT DISTINCT perfil_id, 'posesiones.crear'
FROM "perfil_permisos"
WHERE permiso = 'atenciones.crear_caso'
ON CONFLICT DO NOTHING;
