CREATE TYPE "public"."estado_rendicion_cliente" AS ENUM('Solicitada', 'ChequeEmitido', 'Entregada');--> statement-breakpoint
ALTER TYPE "public"."estado_provision" ADD VALUE 'Reingresado' BEFORE 'Cerrada';--> statement-breakpoint
ALTER TYPE "public"."estado_provision" ADD VALUE 'RendidaCliente' BEFORE 'Cerrada';--> statement-breakpoint
CREATE TABLE "rendiciones_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"estado" "estado_rendicion_cliente" DEFAULT 'Solicitada' NOT NULL,
	"monto" integer,
	"numero_cheque" varchar(40),
	"observacion" text,
	"solicitada_por_id" uuid NOT NULL,
	"solicitada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cheque_por_id" uuid,
	"cheque_en" timestamp with time zone,
	"entregada_por_id" uuid,
	"entregada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rendiciones_cliente" ADD CONSTRAINT "rendiciones_cliente_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendiciones_cliente" ADD CONSTRAINT "rendiciones_cliente_solicitada_por_id_usuarios_id_fk" FOREIGN KEY ("solicitada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendiciones_cliente" ADD CONSTRAINT "rendiciones_cliente_cheque_por_id_usuarios_id_fk" FOREIGN KEY ("cheque_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendiciones_cliente" ADD CONSTRAINT "rendiciones_cliente_entregada_por_id_usuarios_id_fk" FOREIGN KEY ("entregada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rendiciones_cliente_atencion_idx" ON "rendiciones_cliente" USING btree ("atencion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rendiciones_cliente_en_curso_uq" ON "rendiciones_cliente" USING btree ("atencion_id") WHERE estado <> 'Entregada';