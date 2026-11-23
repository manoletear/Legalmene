-- Listar pagos pasa a requerir "pagos.ver": lo reciben los perfiles que ya podían iniciar
-- pagos o ver finanzas. "pagos.confirmar" queda solo para el Administrador (que tiene todo).
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT DISTINCT perfil_id, 'pagos.ver'
FROM "perfil_permisos"
WHERE permiso IN ('pagos.iniciar', 'finanzas.ver')
ON CONFLICT DO NOTHING;
