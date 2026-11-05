-- Paso 3b (Anexo PSL): arancel por atención y ciclo completo de provisiones de fondos.

CREATE TYPE "public"."medio_pago" AS ENUM('WebPay', 'CasaCentral', 'Transferencia');--> statement-breakpoint
CREATE TYPE "public"."estado_arancel_atencion" AS ENUM('NoRequerido', 'Requerido', 'EnAprobacion', 'Aprobado', 'Pagado', 'Rechazado');--> statement-breakpoint
ALTER TYPE "public"."rol_usuario" ADD VALUE 'Contador';--> statement-breakpoint
ALTER TYPE "public"."rol_usuario" ADD VALUE 'Finanzas';--> statement-breakpoint
CREATE TABLE "provisiones_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provision_id" uuid NOT NULL,
	"estado_desde" "estado_provision",
	"estado_hasta" "estado_provision" NOT NULL,
	"usuario_id" uuid,
	"observacion" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aranceles_atencion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"arancel_id" uuid,
	"cobertura_modalidad" "modalidad_cobertura",
	"cobertura_porcentaje" integer,
	"copago_uf_centesimas" integer,
	"estado" "estado_arancel_atencion" NOT NULL,
	"motivo_rechazo" text,
	"fecha_pago" date,
	"medio_pago" "medio_pago",
	"uf_valor_centavos" integer,
	"monto_clp" integer,
	"comprobante_documento_id" uuid,
	"registrado_por_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aranceles_atencion_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arancel_atencion_id" uuid NOT NULL,
	"estado_desde" "estado_arancel_atencion",
	"estado_hasta" "estado_arancel_atencion" NOT NULL,
	"usuario_id" uuid,
	"observacion" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provision_movimientos" ADD COLUMN "documento_id" uuid;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "medio_pago_cliente" "medio_pago";--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "fecha_pago_cliente" date;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "fecha_disponible" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "monto_entregado" integer;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "fecha_entrega" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "fecha_rendicion" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "numero_cheque" varchar(40);--> statement-breakpoint
ALTER TABLE "provisiones_eventos" ADD CONSTRAINT "provisiones_eventos_provision_id_provisiones_id_fk" FOREIGN KEY ("provision_id") REFERENCES "public"."provisiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisiones_eventos" ADD CONSTRAINT "provisiones_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aranceles_atencion" ADD CONSTRAINT "aranceles_atencion_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aranceles_atencion" ADD CONSTRAINT "aranceles_atencion_arancel_id_aranceles_id_fk" FOREIGN KEY ("arancel_id") REFERENCES "public"."aranceles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aranceles_atencion" ADD CONSTRAINT "aranceles_atencion_comprobante_documento_id_documentos_id_fk" FOREIGN KEY ("comprobante_documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aranceles_atencion" ADD CONSTRAINT "aranceles_atencion_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aranceles_atencion_eventos" ADD CONSTRAINT "aranceles_atencion_eventos_arancel_atencion_id_aranceles_atencion_id_fk" FOREIGN KEY ("arancel_atencion_id") REFERENCES "public"."aranceles_atencion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aranceles_atencion_eventos" ADD CONSTRAINT "aranceles_atencion_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provisiones_eventos_provision_idx" ON "provisiones_eventos" USING btree ("provision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aranceles_atencion_atencion_uq" ON "aranceles_atencion" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "aranceles_atencion_estado_idx" ON "aranceles_atencion" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "aranceles_atencion_eventos_arancel_idx" ON "aranceles_atencion_eventos" USING btree ("arancel_atencion_id");--> statement-breakpoint
ALTER TABLE "provision_movimientos" ADD CONSTRAINT "provision_movimientos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."provisiones" ALTER COLUMN "estado" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."provisiones" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."provisiones_eventos" ALTER COLUMN "estado_desde" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."provisiones_eventos" ALTER COLUMN "estado_hasta" SET DATA TYPE text;--> statement-breakpoint
-- Provisiones legadas: las Aprobadas ya podían tener gastos, así que pasan a Entregadas
-- por su monto completo; Solicitada y Rechazada se mantienen.
UPDATE "provisiones" SET "estado" = 'Entregada', "monto_entregado" = "monto", "fecha_entrega" = coalesce("fecha_resolucion", "fecha_solicitud")
WHERE "estado" = 'Aprobada';--> statement-breakpoint
DROP TYPE "public"."estado_provision";--> statement-breakpoint
CREATE TYPE "public"."estado_provision" AS ENUM('Solicitada', 'Pagada', 'EnAprobacion', 'Autorizada', 'Rechazada', 'Disponible', 'Entregada', 'Rendida', 'Cerrada');--> statement-breakpoint
ALTER TABLE "public"."provisiones" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_provision" USING "estado"::"public"."estado_provision";--> statement-breakpoint
ALTER TABLE "public"."provisiones" ALTER COLUMN "estado" SET DEFAULT 'Solicitada';--> statement-breakpoint
ALTER TABLE "public"."provisiones_eventos" ALTER COLUMN "estado_desde" SET DATA TYPE "public"."estado_provision" USING "estado_desde"::"public"."estado_provision";--> statement-breakpoint
ALTER TABLE "public"."provisiones_eventos" ALTER COLUMN "estado_hasta" SET DATA TYPE "public"."estado_provision" USING "estado_hasta"::"public"."estado_provision";--> statement-breakpoint
-- Asesorías y juicios existentes quedan con arancel "NoRequerido" para no detenerlos;
-- las nuevas calculan su copago al crearse.
INSERT INTO "aranceles_atencion" ("atencion_id", "estado")
SELECT "id", 'NoRequerido' FROM "atenciones" WHERE "tipo" IN ('Asesoria', 'Juicio');