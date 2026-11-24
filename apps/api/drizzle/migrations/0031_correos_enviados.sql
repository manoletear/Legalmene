CREATE TYPE "public"."estado_correo" AS ENUM('Enviado', 'Omitido', 'Error');--> statement-breakpoint
CREATE TABLE "correos_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid,
	"plantilla" varchar(60) NOT NULL,
	"destinatarios" jsonb NOT NULL,
	"asunto" varchar(300) NOT NULL,
	"estado" "estado_correo" NOT NULL,
	"enviado_por_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correos_enviados" ADD CONSTRAINT "correos_enviados_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correos_enviados" ADD CONSTRAINT "correos_enviados_enviado_por_id_usuarios_id_fk" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correos_enviados_atencion_idx" ON "correos_enviados" USING btree ("atencion_id","created_at");