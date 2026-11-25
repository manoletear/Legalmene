ALTER TYPE "public"."estado_provision" ADD VALUE 'Borrador' BEFORE 'Solicitada';--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "gestion_id" uuid;