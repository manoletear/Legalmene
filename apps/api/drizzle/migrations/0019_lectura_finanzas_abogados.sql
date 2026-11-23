-- Anexo §XI l.1967 y l.2001: abogados y jefaturas consultan aranceles (bandeja de finanzas) y pagos
-- WebPay en solo lectura. Las lecturas pasan por filtroAtenciones(): cada uno ve lo de sus atenciones
-- (o de su equipo). Los perfiles personalizados quedan a criterio del Administrador.
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT p.id, x.permiso
FROM "perfiles" p
CROSS JOIN (VALUES ('finanzas.ver'), ('pagos.ver')) AS x(permiso)
WHERE p.codigo IN ('ABOGADO', 'JEFATURA_CONSULTAS', 'JEFATURA_JUDICIAL', 'JEFATURA_FRAUDE')
ON CONFLICT DO NOTHING;
