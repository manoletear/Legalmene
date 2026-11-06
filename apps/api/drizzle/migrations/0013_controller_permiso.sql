-- Controller de usuarios (paso 5a): lo reciben las jefaturas y la gerencia de servicios.
-- Los perfiles personalizados quedan a criterio del Administrador.
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT id, 'controller.ver'
FROM "perfiles"
WHERE codigo IN ('JEFATURA_CONSULTAS', 'JEFATURA_JUDICIAL', 'JEFATURA_FRAUDE', 'GERENCIA_SERVICIOS')
ON CONFLICT DO NOTHING;
