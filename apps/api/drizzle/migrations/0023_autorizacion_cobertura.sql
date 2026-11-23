ALTER TABLE "atenciones" ADD COLUMN "autorizacion_cobertura" jsonb;
--> statement-breakpoint
-- Autorizar atenciones sin cobertura: Gerencia de Servicios (Anexo §VII 01.2).
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT id, 'atenciones.autorizar_sin_cobertura'
FROM "perfiles"
WHERE codigo = 'GERENCIA_SERVICIOS'
ON CONFLICT DO NOTHING;
