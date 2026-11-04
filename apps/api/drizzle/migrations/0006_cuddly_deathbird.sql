CREATE TYPE "public"."estado_provision" AS ENUM('Solicitada', 'Aprobada', 'Rechazada');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_provision" AS ENUM('Gasto', 'Reintegro');--> statement-breakpoint
CREATE TABLE "aranceles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"descripcion" varchar(250) NOT NULL,
	"competencia" "competencia" NOT NULL,
	"tipo" "tipo_atencion",
	"valor_uf_centesimas" integer NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valores_uf" (
	"fecha" date PRIMARY KEY NOT NULL,
	"valor_centavos" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provision_movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provision_id" uuid NOT NULL,
	"tipo" "tipo_movimiento_provision" NOT NULL,
	"monto" integer NOT NULL,
	"glosa" varchar(300) NOT NULL,
	"registrado_por_id" uuid NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_plan" varchar(20) NOT NULL,
	"atencion_id" uuid NOT NULL,
	"monto" integer NOT NULL,
	"motivo" varchar(500) NOT NULL,
	"estado" "estado_provision" DEFAULT 'Solicitada' NOT NULL,
	"solicitada_por_id" uuid NOT NULL,
	"resuelta_por_id" uuid,
	"observacion_resolucion" text,
	"fecha_solicitud" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_resolucion" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "arancel_id" uuid;--> statement-breakpoint
ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provision_movimientos" ADD CONSTRAINT "provision_movimientos_provision_id_provisiones_id_fk" FOREIGN KEY ("provision_id") REFERENCES "public"."provisiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provision_movimientos" ADD CONSTRAINT "provision_movimientos_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisiones" ADD CONSTRAINT "provisiones_cod_plan_planes_cod_plan_fk" FOREIGN KEY ("cod_plan") REFERENCES "public"."planes"("cod_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisiones" ADD CONSTRAINT "provisiones_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisiones" ADD CONSTRAINT "provisiones_solicitada_por_id_usuarios_id_fk" FOREIGN KEY ("solicitada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisiones" ADD CONSTRAINT "provisiones_resuelta_por_id_usuarios_id_fk" FOREIGN KEY ("resuelta_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aranceles_plan_codigo_uq" ON "aranceles" USING btree ("cod_plan","codigo");--> statement-breakpoint
CREATE INDEX "aranceles_plan_competencia_idx" ON "aranceles" USING btree ("cod_plan","competencia");--> statement-breakpoint
CREATE INDEX "provision_movimientos_provision_idx" ON "provision_movimientos" USING btree ("provision_id");--> statement-breakpoint
CREATE INDEX "provisiones_plan_estado_idx" ON "provisiones" USING btree ("cod_plan","estado");--> statement-breakpoint
CREATE INDEX "provisiones_atencion_idx" ON "provisiones" USING btree ("atencion_id");--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_arancel_id_aranceles_id_fk" FOREIGN KEY ("arancel_id") REFERENCES "public"."aranceles"("id") ON DELETE set null ON UPDATE no action;