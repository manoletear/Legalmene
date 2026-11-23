ALTER TABLE "atenciones" ADD COLUMN "solicitud_termino" jsonb;--> statement-breakpoint
-- V°B° de término: lo dan las jefaturas y la gerencia de servicios (los perfiles personalizados
-- quedan a criterio del Administrador).
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT id, 'atenciones.aprobar_termino'
FROM "perfiles"
WHERE codigo IN ('JEFATURA_CONSULTAS', 'JEFATURA_JUDICIAL', 'JEFATURA_FRAUDE', 'GERENCIA_SERVICIOS')
ON CONFLICT DO NOTHING;
