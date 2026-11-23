-- Anexo §X: Ejecutivo de Finanzas (EF) separado de Gerencia de Finanzas (GAF).
INSERT INTO "perfiles" ("codigo", "nombre", "descripcion", "es_sistema") VALUES
  ('EJECUTIVO_FINANZAS', 'Ejecutivo de Finanzas', 'Gira y entrega fondos a los abogados y emite el cheque de devolución al cliente (EF).', true)
ON CONFLICT ("codigo") DO NOTHING;
--> statement-breakpoint
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT p.id, x.permiso
FROM "perfiles" p
CROSS JOIN (VALUES ('afiliados.ver'), ('atenciones.ver_todas'), ('finanzas.ver'), ('pagos.ver'), ('provisiones.disponer_entregar')) AS x(permiso)
WHERE p.codigo = 'EJECUTIVO_FINANZAS'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "perfiles"
SET "descripcion" = 'Gerencia de administración y finanzas: controla ingresos de provisiones, devoluciones a clientes, aranceles y UF (GAF).'
WHERE "codigo" = 'GERENCIA_FINANZAS';
