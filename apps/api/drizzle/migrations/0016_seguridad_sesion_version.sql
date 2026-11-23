ALTER TABLE "usuarios" ADD COLUMN "sesion_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Auditoría de seguridad: el interceptor guardaba credenciales en el log. Se redactan las
-- filas existentes (respuestas de login con tokens de sesión y secretos de webhooks).
UPDATE "auditoria" SET "cambios" = '{"redactado": true}'::jsonb WHERE "entidad" = 'auth';--> statement-breakpoint
UPDATE "auditoria" SET "cambios" = jsonb_set("cambios", '{after,secret}', '"[REDACTADO]"') WHERE "entidad" = 'webhooks' AND "cambios" -> 'after' ? 'secret';--> statement-breakpoint
UPDATE "auditoria" SET "cambios" = jsonb_set("cambios", '{after,headers}', '"[REDACTADO]"') WHERE "entidad" = 'webhooks' AND jsonb_typeof("cambios" -> 'after' -> 'headers') = 'object';--> statement-breakpoint
UPDATE "auditoria" SET "cambios" = jsonb_set("cambios", '{requestBody,headers}', '"[REDACTADO]"') WHERE "entidad" = 'webhooks' AND jsonb_typeof("cambios" -> 'requestBody' -> 'headers') = 'object';
