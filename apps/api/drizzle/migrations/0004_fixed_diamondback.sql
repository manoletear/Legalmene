CREATE TYPE "public"."webhook_entrega_estado" AS ENUM('Pendiente', 'Enviada', 'Fallida', 'Reintentar');--> statement-breakpoint
CREATE TYPE "public"."webhook_evento" AS ENUM('atencion.creada', 'atencion.derivada', 'atencion.cerrada', 'gestion.creada', 'gestion.completada', 'comite.convocado', 'comite.cerrado', 'pago.autorizado', 'pago.rechazado', 'afiliado.eliminado');--> statement-breakpoint
CREATE TABLE "webhook_entregas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suscripcion_id" uuid NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"evento" varchar(60) NOT NULL,
	"payload" jsonb NOT NULL,
	"estado" "webhook_entrega_estado" DEFAULT 'Pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"proximo_reintento" timestamp with time zone,
	"http_status" integer,
	"respuesta" text,
	"ultimo_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks_suscripciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret" varchar(128) NOT NULL,
	"eventos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"headers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_entregas" ADD CONSTRAINT "webhook_entregas_suscripcion_id_webhooks_suscripciones_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."webhooks_suscripciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_suscripciones" ADD CONSTRAINT "webhooks_suscripciones_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_entregas_estado_idx" ON "webhook_entregas" USING btree ("estado","proximo_reintento");--> statement-breakpoint
CREATE INDEX "webhook_entregas_sus_idx" ON "webhook_entregas" USING btree ("suscripcion_id","created_at");--> statement-breakpoint
CREATE INDEX "webhooks_sus_plan_activo_idx" ON "webhooks_suscripciones" USING btree ("cod_plan","activo");