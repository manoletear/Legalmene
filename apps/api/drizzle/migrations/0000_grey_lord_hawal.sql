CREATE TYPE "public"."rol_usuario" AS ENUM('Administrador', 'Supervisor', 'Abogado', 'Operador', 'Auditor');--> statement-breakpoint
CREATE TYPE "public"."vigencia_afiliado" AS ENUM('Activo', 'Inactivo', 'Eliminado');--> statement-breakpoint
CREATE TYPE "public"."competencia" AS ENUM('Civil', 'Penal', 'Laboral', 'Familia', 'Tributario', 'Comercial', 'Administrativo', 'Constitucional', 'Otro');--> statement-breakpoint
CREATE TYPE "public"."estado_atencion" AS ENUM('Abierta', 'EnGestion', 'EnComite', 'Suspendida', 'Cerrada', 'Archivada');--> statement-breakpoint
CREATE TYPE "public"."prioridad" AS ENUM('Baja', 'Media', 'Alta', 'Urgente');--> statement-breakpoint
CREATE TYPE "public"."tipo_atencion" AS ENUM('Consulta', 'Asesoria', 'Juicio');--> statement-breakpoint
CREATE TYPE "public"."estado_gestion" AS ENUM('Pendiente', 'Completada', 'Vencida', 'Cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_gestion" AS ENUM('LlamadaTelefonica', 'Email', 'Reunion', 'EscritoJudicial', 'Audiencia', 'Notificacion', 'AnalisisDocumental', 'Resolucion', 'Otra');--> statement-breakpoint
CREATE TYPE "public"."decision_comite" AS ENUM('Aprobado', 'Rechazado', 'Pendiente', 'Diferido');--> statement-breakpoint
CREATE TYPE "public"."estado_comite" AS ENUM('Convocado', 'EnSesion', 'Cerrado', 'Cancelado');--> statement-breakpoint
CREATE TYPE "public"."rol_participante_comite" AS ENUM('Presidente', 'Miembro', 'Secretario', 'Observador');--> statement-breakpoint
CREATE TYPE "public"."voto_comite" AS ENUM('AFavor', 'EnContra', 'Abstencion', 'Pendiente');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('Iniciado', 'Autorizado', 'Rechazado', 'Anulado', 'Reembolsado');--> statement-breakpoint
CREATE TYPE "public"."proveedor_pago" AS ENUM('WebPay', 'Khipu', 'Manual');--> statement-breakpoint
CREATE TABLE "planes" (
	"cod_plan" varchar(20) PRIMARY KEY NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"descripcion" text,
	"vigente" boolean DEFAULT true NOT NULL,
	"fecha_creacion" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_oid" varchar(128) NOT NULL,
	"email" varchar(200) NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"rol" "rol_usuario" NOT NULL,
	"cod_planes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_entra_oid_unique" UNIQUE("entra_oid"),
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"rut" varchar(12) NOT NULL,
	"nombres" varchar(120) NOT NULL,
	"apellido_paterno" varchar(80) NOT NULL,
	"apellido_materno" varchar(80),
	"email" varchar(200),
	"telefono" varchar(20),
	"direccion" varchar(250),
	"comuna" varchar(80),
	"region" varchar(80),
	"fecha_nacimiento" date,
	"vigencia" "vigencia_afiliado" DEFAULT 'Activo' NOT NULL,
	"fecha_ingreso" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_egreso" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atenciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlativo" varchar(32) NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"afiliado_id" uuid NOT NULL,
	"tipo" "tipo_atencion" NOT NULL,
	"estado" "estado_atencion" DEFAULT 'Abierta' NOT NULL,
	"competencia" "competencia" NOT NULL,
	"materia" varchar(250) NOT NULL,
	"descripcion" text,
	"abogado_asignado_id" uuid,
	"fecha_apertura" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_cierre" timestamp with time zone,
	"fecha_ultima_gestion" timestamp with time zone,
	"prioridad" "prioridad" DEFAULT 'Media' NOT NULL,
	"origen" varchar(80),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atenciones_correlativo_unique" UNIQUE("correlativo")
);
--> statement-breakpoint
CREATE TABLE "correlativos" (
	"cod_plan" varchar(20) NOT NULL,
	"tipo" "tipo_atencion" NOT NULL,
	"anio" varchar(4) NOT NULL,
	"valor" jsonb DEFAULT '{"next":1}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gestiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"tipo" "tipo_gestion" NOT NULL,
	"estado" "estado_gestion" DEFAULT 'Pendiente' NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"detalle" text,
	"responsable_id" uuid NOT NULL,
	"fecha_programada" timestamp with time zone,
	"fecha_compromiso" timestamp with time zone,
	"fecha_ejecucion" timestamp with time zone,
	"resultado" text,
	"documentos_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"estado" "estado_comite" DEFAULT 'Convocado' NOT NULL,
	"decision" "decision_comite" DEFAULT 'Pendiente' NOT NULL,
	"fecha_convocatoria" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_sesion" timestamp with time zone,
	"fecha_cierre" timestamp with time zone,
	"convocado_por" uuid NOT NULL,
	"motivo" text NOT NULL,
	"acta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participantes_comite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comite_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rol" "rol_participante_comite" NOT NULL,
	"voto" "voto_comite" DEFAULT 'Pendiente' NOT NULL,
	"comentario" text
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid,
	"afiliado_id" uuid NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"monto" integer NOT NULL,
	"moneda" varchar(3) DEFAULT 'CLP' NOT NULL,
	"estado" "estado_pago" DEFAULT 'Iniciado' NOT NULL,
	"proveedor" "proveedor_pago" DEFAULT 'WebPay' NOT NULL,
	"token_transaccion" varchar(128),
	"orden_compra" varchar(64) NOT NULL,
	"auth_code" varchar(32),
	"numero_tarjeta" varchar(4),
	"metadata" jsonb,
	"fecha_iniciado" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_resolucion" timestamp with time zone,
	CONSTRAINT "pagos_orden_compra_unique" UNIQUE("orden_compra")
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid,
	"nombre" varchar(250) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"s3_bucket" varchar(120) NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"s3_version_id" varchar(120),
	"sha256" varchar(64) NOT NULL,
	"subido_por" uuid NOT NULL,
	"metadata" jsonb,
	"fecha_subida" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" varchar(200),
	"accion" varchar(60) NOT NULL,
	"entidad" varchar(60) NOT NULL,
	"entidad_id" varchar(64) NOT NULL,
	"cod_plan" varchar(20),
	"cambios" jsonb,
	"ip" varchar(45),
	"user_agent" varchar(250),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "afiliados" ADD CONSTRAINT "afiliados_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_afiliado_id_afiliados_id_fk" FOREIGN KEY ("afiliado_id") REFERENCES "public"."afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_abogado_asignado_id_usuarios_id_fk" FOREIGN KEY ("abogado_asignado_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gestiones" ADD CONSTRAINT "gestiones_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gestiones" ADD CONSTRAINT "gestiones_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comites" ADD CONSTRAINT "comites_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comites" ADD CONSTRAINT "comites_convocado_por_usuarios_id_fk" FOREIGN KEY ("convocado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_comite" ADD CONSTRAINT "participantes_comite_comite_id_comites_id_fk" FOREIGN KEY ("comite_id") REFERENCES "public"."comites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_comite" ADD CONSTRAINT "participantes_comite_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_afiliado_id_afiliados_id_fk" FOREIGN KEY ("afiliado_id") REFERENCES "public"."afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "afiliados_rut_plan_uq" ON "afiliados" USING btree ("rut","cod_plan");--> statement-breakpoint
CREATE INDEX "afiliados_plan_vigencia_idx" ON "afiliados" USING btree ("cod_plan","vigencia");--> statement-breakpoint
CREATE INDEX "afiliados_nombre_search_idx" ON "afiliados" USING btree ("apellido_paterno","nombres");--> statement-breakpoint
CREATE INDEX "atenciones_plan_estado_idx" ON "atenciones" USING btree ("cod_plan","estado");--> statement-breakpoint
CREATE INDEX "atenciones_afiliado_idx" ON "atenciones" USING btree ("afiliado_id");--> statement-breakpoint
CREATE INDEX "atenciones_abogado_idx" ON "atenciones" USING btree ("abogado_asignado_id");--> statement-breakpoint
CREATE INDEX "atenciones_tipo_fecha_idx" ON "atenciones" USING btree ("tipo","fecha_apertura");--> statement-breakpoint
CREATE UNIQUE INDEX "correlativos_pk" ON "correlativos" USING btree ("cod_plan","tipo","anio");--> statement-breakpoint
CREATE INDEX "gestiones_atencion_estado_idx" ON "gestiones" USING btree ("atencion_id","estado");--> statement-breakpoint
CREATE INDEX "gestiones_compromiso_idx" ON "gestiones" USING btree ("fecha_compromiso");--> statement-breakpoint
CREATE INDEX "gestiones_responsable_idx" ON "gestiones" USING btree ("responsable_id","estado");--> statement-breakpoint
CREATE INDEX "comites_atencion_idx" ON "comites" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "comites_estado_idx" ON "comites" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "pagos_afiliado_idx" ON "pagos" USING btree ("afiliado_id");--> statement-breakpoint
CREATE INDEX "pagos_estado_idx" ON "pagos" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "pagos_atencion_idx" ON "pagos" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "documentos_atencion_idx" ON "documentos" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "documentos_sha_idx" ON "documentos" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_actor_idx" ON "auditoria" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "auditoria_timestamp_idx" ON "auditoria" USING btree ("timestamp");