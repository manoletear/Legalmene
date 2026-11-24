CREATE TYPE "public"."estado_compromiso" AS ENUM('Pendiente', 'Cumplido', 'NoCumplido');--> statement-breakpoint
CREATE TYPE "public"."estado_cita" AS ENUM('Programada', 'Realizada', 'Cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_cita" AS ENUM('Entrevista', 'Videollamada', 'Reunion', 'Audiencia', 'Comparendo', 'Otro');--> statement-breakpoint
CREATE TABLE "compromisos_comite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comite_id" uuid NOT NULL,
	"atencion_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"responsable_id" uuid NOT NULL,
	"fecha_compromiso" date NOT NULL,
	"estado" "estado_compromiso" DEFAULT 'Pendiente' NOT NULL,
	"validado_en_comite_id" uuid,
	"validado_por_id" uuid,
	"validado_at" timestamp with time zone,
	"observacion" text,
	"creado_por_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_cita" NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"lugar" varchar(300),
	"estado" "estado_cita" DEFAULT 'Programada' NOT NULL,
	"notas" text,
	"responsable_id" uuid NOT NULL,
	"atencion_id" uuid,
	"afiliado_id" uuid,
	"creado_por_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compromisos_comite" ADD CONSTRAINT "compromisos_comite_comite_id_comites_id_fk" FOREIGN KEY ("comite_id") REFERENCES "public"."comites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisos_comite" ADD CONSTRAINT "compromisos_comite_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisos_comite" ADD CONSTRAINT "compromisos_comite_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisos_comite" ADD CONSTRAINT "compromisos_comite_validado_en_comite_id_comites_id_fk" FOREIGN KEY ("validado_en_comite_id") REFERENCES "public"."comites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisos_comite" ADD CONSTRAINT "compromisos_comite_validado_por_id_usuarios_id_fk" FOREIGN KEY ("validado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisos_comite" ADD CONSTRAINT "compromisos_comite_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_afiliado_id_afiliados_id_fk" FOREIGN KEY ("afiliado_id") REFERENCES "public"."afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compromisos_comite_comite_idx" ON "compromisos_comite" USING btree ("comite_id");--> statement-breakpoint
CREATE INDEX "compromisos_comite_atencion_estado_idx" ON "compromisos_comite" USING btree ("atencion_id","estado");--> statement-breakpoint
CREATE INDEX "citas_responsable_inicio_idx" ON "citas" USING btree ("responsable_id","inicio");--> statement-breakpoint
CREATE INDEX "citas_atencion_idx" ON "citas" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "citas_inicio_idx" ON "citas" USING btree ("inicio");--> statement-breakpoint
-- Permisos de agenda para los perfiles del sistema (Anexo §IV): operación y jefaturas.
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT p.id, x.permiso
FROM "perfiles" p
CROSS JOIN (VALUES ('agenda.ver'), ('agenda.gestionar')) AS x(permiso)
WHERE p.codigo IN ('GERENCIA_SERVICIOS', 'JEFATURA_CONSULTAS', 'JEFATURA_JUDICIAL', 'JEFATURA_FRAUDE', 'ABOGADO', 'TRAMITADOR')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT p.id, 'agenda.calendario_audiencias'
FROM "perfiles" p
WHERE p.codigo IN ('GERENCIA_SERVICIOS', 'JEFATURA_JUDICIAL')
ON CONFLICT DO NOTHING;
