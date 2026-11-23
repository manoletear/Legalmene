CREATE TYPE "public"."notif_severidad" AS ENUM('info', 'warn', 'critical');--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"usuario_id" uuid NOT NULL,
	"severidad" "notif_severidad" DEFAULT 'info' NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"detalle" text,
	"accion_url" varchar(500),
	"metadata" jsonb,
	"seen" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notif_usuario_seen_idx" ON "notificaciones" USING btree ("usuario_id","seen","created_at");--> statement-breakpoint
CREATE INDEX "notif_plan_usuario_idx" ON "notificaciones" USING btree ("cod_plan","usuario_id");