ALTER TABLE "notificaciones" ALTER COLUMN "cod_plan" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "intentos_fallidos" integer DEFAULT 0 NOT NULL;