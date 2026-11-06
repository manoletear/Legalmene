-- Paso 4 (Anexo §IV): perfiles y permisos configurables; el usuario deja de tener rol fijo.
CREATE TABLE "perfil_permisos" (
	"perfil_id" uuid NOT NULL,
	"permiso" varchar(80) NOT NULL,
	CONSTRAINT "perfil_permisos_perfil_id_permiso_pk" PRIMARY KEY("perfil_id","permiso")
);
--> statement-breakpoint
CREATE TABLE "perfiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(40) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"vigente" boolean DEFAULT true NOT NULL,
	"es_sistema" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "perfil_id" uuid;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "jefe_id" uuid;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "anexo" varchar(10);--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "bloqueado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "motivo_bloqueo" text;--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "creado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "perfil_permisos" ADD CONSTRAINT "perfil_permisos_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_jefe_id_usuarios_id_fk" FOREIGN KEY ("jefe_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usuarios_perfil_idx" ON "usuarios" USING btree ("perfil_id");--> statement-breakpoint
CREATE INDEX "usuarios_jefe_idx" ON "usuarios" USING btree ("jefe_id");--> statement-breakpoint

-- Perfiles del Anexo §IV con sus permisos por defecto (packages/shared PERFILES_SISTEMA).
-- ADMIN no lleva filas: el código le da siempre todos los permisos.
INSERT INTO "perfiles" ("codigo", "nombre", "descripcion", "es_sistema") VALUES
  ('ADMIN', 'Administrador del sistema', 'Acceso total a tablas, usuarios y perfiles.', true),
  ('GERENCIA_SERVICIOS', 'Gerencia de Servicios', 'Ve todas las atenciones, aprueba flujos y accede a informes.', true),
  ('JEFATURA_CONSULTAS', 'Jefatura Consultas', 'Jefatura del área consultas: ve y aprueba lo de su equipo.', true),
  ('JEFATURA_JUDICIAL', 'Jefatura Judicial', 'Jefatura del área judicial: ve y aprueba lo de su equipo.', true),
  ('JEFATURA_FRAUDE', 'Jefatura Fraude', 'Jefatura del área fraude: ve y aprueba lo de su equipo.', true),
  ('ABOGADO', 'Abogado', 'Atiende y gestiona solo sus atenciones.', true),
  ('TRAMITADOR', 'Procurador / Tramitador / Asistente', 'Registra gestiones y documentos, crea atenciones y las asigna al abogado.', true),
  ('GERENCIA_FINANZAS', 'Gerencia de Finanzas', 'Ejecutivo y gerencia de finanzas: dispone, entrega y devuelve fondos.', true),
  ('CONTADOR', 'Contador', 'Ejecutivo contable: registra pagos de aranceles y provisiones.', true),
  ('ASISTENTE_CONTABLE', 'Asistente Contable', 'Apoya al contador en aranceles y provisiones.', true),
  ('COMERCIAL', 'Comercial', 'Consulta vigencias, atenciones por RUT y reportes.', true),
  ('ADMINISTRATIVO', 'Administrativo', 'Consulta vigencias y atenciones por RUT.', true),
  ('AUDITOR', 'Auditor', 'Lectura de atenciones, reportes y auditoría.', true);
--> statement-breakpoint
INSERT INTO "perfil_permisos" ("perfil_id", "permiso")
SELECT p.id, v.permiso FROM (VALUES
  ('GERENCIA_SERVICIOS', 'afiliados.ver'),
  ('GERENCIA_SERVICIOS', 'atenciones.crear_consulta'),
  ('GERENCIA_SERVICIOS', 'atenciones.crear_caso'),
  ('GERENCIA_SERVICIOS', 'atenciones.editar'),
  ('GERENCIA_SERVICIOS', 'atenciones.cambiar_estado'),
  ('GERENCIA_SERVICIOS', 'derivaciones.solicitar'),
  ('GERENCIA_SERVICIOS', 'gestiones.registrar'),
  ('GERENCIA_SERVICIOS', 'comites.votar'),
  ('GERENCIA_SERVICIOS', 'documentos.subir'),
  ('GERENCIA_SERVICIOS', 'aranceles_atencion.enviar'),
  ('GERENCIA_SERVICIOS', 'provisiones.solicitar'),
  ('GERENCIA_SERVICIOS', 'provisiones.registrar_movimientos'),
  ('GERENCIA_SERVICIOS', 'provisiones.rendir'),
  ('GERENCIA_SERVICIOS', 'atenciones.revisar_comite'),
  ('GERENCIA_SERVICIOS', 'derivaciones.aprobar'),
  ('GERENCIA_SERVICIOS', 'comites.convocar'),
  ('GERENCIA_SERVICIOS', 'aranceles_atencion.aprobar'),
  ('GERENCIA_SERVICIOS', 'provisiones.autorizar'),
  ('GERENCIA_SERVICIOS', 'afiliados.crear'),
  ('GERENCIA_SERVICIOS', 'afiliados.editar'),
  ('GERENCIA_SERVICIOS', 'reportes.ver'),
  ('GERENCIA_SERVICIOS', 'exportar.datos'),
  ('GERENCIA_SERVICIOS', 'atenciones.ver_todas'),
  ('GERENCIA_SERVICIOS', 'finanzas.ver'),
  ('GERENCIA_SERVICIOS', 'webhooks.ver'),
  ('GERENCIA_SERVICIOS', 'aranceles.administrar'),
  ('GERENCIA_SERVICIOS', 'cargas.ejecutar'),
  ('JEFATURA_CONSULTAS', 'afiliados.ver'),
  ('JEFATURA_CONSULTAS', 'atenciones.crear_consulta'),
  ('JEFATURA_CONSULTAS', 'atenciones.crear_caso'),
  ('JEFATURA_CONSULTAS', 'atenciones.editar'),
  ('JEFATURA_CONSULTAS', 'atenciones.cambiar_estado'),
  ('JEFATURA_CONSULTAS', 'derivaciones.solicitar'),
  ('JEFATURA_CONSULTAS', 'gestiones.registrar'),
  ('JEFATURA_CONSULTAS', 'comites.votar'),
  ('JEFATURA_CONSULTAS', 'documentos.subir'),
  ('JEFATURA_CONSULTAS', 'aranceles_atencion.enviar'),
  ('JEFATURA_CONSULTAS', 'provisiones.solicitar'),
  ('JEFATURA_CONSULTAS', 'provisiones.registrar_movimientos'),
  ('JEFATURA_CONSULTAS', 'provisiones.rendir'),
  ('JEFATURA_CONSULTAS', 'atenciones.ver_equipo'),
  ('JEFATURA_CONSULTAS', 'atenciones.revisar_comite'),
  ('JEFATURA_CONSULTAS', 'derivaciones.aprobar'),
  ('JEFATURA_CONSULTAS', 'comites.convocar'),
  ('JEFATURA_CONSULTAS', 'aranceles_atencion.aprobar'),
  ('JEFATURA_CONSULTAS', 'provisiones.autorizar'),
  ('JEFATURA_CONSULTAS', 'afiliados.crear'),
  ('JEFATURA_CONSULTAS', 'afiliados.editar'),
  ('JEFATURA_CONSULTAS', 'reportes.ver'),
  ('JEFATURA_CONSULTAS', 'exportar.datos'),
  ('JEFATURA_JUDICIAL', 'afiliados.ver'),
  ('JEFATURA_JUDICIAL', 'atenciones.crear_consulta'),
  ('JEFATURA_JUDICIAL', 'atenciones.crear_caso'),
  ('JEFATURA_JUDICIAL', 'atenciones.editar'),
  ('JEFATURA_JUDICIAL', 'atenciones.cambiar_estado'),
  ('JEFATURA_JUDICIAL', 'derivaciones.solicitar'),
  ('JEFATURA_JUDICIAL', 'gestiones.registrar'),
  ('JEFATURA_JUDICIAL', 'comites.votar'),
  ('JEFATURA_JUDICIAL', 'documentos.subir'),
  ('JEFATURA_JUDICIAL', 'aranceles_atencion.enviar'),
  ('JEFATURA_JUDICIAL', 'provisiones.solicitar'),
  ('JEFATURA_JUDICIAL', 'provisiones.registrar_movimientos'),
  ('JEFATURA_JUDICIAL', 'provisiones.rendir'),
  ('JEFATURA_JUDICIAL', 'atenciones.ver_equipo'),
  ('JEFATURA_JUDICIAL', 'atenciones.revisar_comite'),
  ('JEFATURA_JUDICIAL', 'derivaciones.aprobar'),
  ('JEFATURA_JUDICIAL', 'comites.convocar'),
  ('JEFATURA_JUDICIAL', 'aranceles_atencion.aprobar'),
  ('JEFATURA_JUDICIAL', 'provisiones.autorizar'),
  ('JEFATURA_JUDICIAL', 'afiliados.crear'),
  ('JEFATURA_JUDICIAL', 'afiliados.editar'),
  ('JEFATURA_JUDICIAL', 'reportes.ver'),
  ('JEFATURA_JUDICIAL', 'exportar.datos'),
  ('JEFATURA_FRAUDE', 'afiliados.ver'),
  ('JEFATURA_FRAUDE', 'atenciones.crear_consulta'),
  ('JEFATURA_FRAUDE', 'atenciones.crear_caso'),
  ('JEFATURA_FRAUDE', 'atenciones.editar'),
  ('JEFATURA_FRAUDE', 'atenciones.cambiar_estado'),
  ('JEFATURA_FRAUDE', 'derivaciones.solicitar'),
  ('JEFATURA_FRAUDE', 'gestiones.registrar'),
  ('JEFATURA_FRAUDE', 'comites.votar'),
  ('JEFATURA_FRAUDE', 'documentos.subir'),
  ('JEFATURA_FRAUDE', 'aranceles_atencion.enviar'),
  ('JEFATURA_FRAUDE', 'provisiones.solicitar'),
  ('JEFATURA_FRAUDE', 'provisiones.registrar_movimientos'),
  ('JEFATURA_FRAUDE', 'provisiones.rendir'),
  ('JEFATURA_FRAUDE', 'atenciones.ver_equipo'),
  ('JEFATURA_FRAUDE', 'atenciones.revisar_comite'),
  ('JEFATURA_FRAUDE', 'derivaciones.aprobar'),
  ('JEFATURA_FRAUDE', 'comites.convocar'),
  ('JEFATURA_FRAUDE', 'aranceles_atencion.aprobar'),
  ('JEFATURA_FRAUDE', 'provisiones.autorizar'),
  ('JEFATURA_FRAUDE', 'afiliados.crear'),
  ('JEFATURA_FRAUDE', 'afiliados.editar'),
  ('JEFATURA_FRAUDE', 'reportes.ver'),
  ('JEFATURA_FRAUDE', 'exportar.datos'),
  ('ABOGADO', 'afiliados.ver'),
  ('ABOGADO', 'atenciones.crear_consulta'),
  ('ABOGADO', 'atenciones.crear_caso'),
  ('ABOGADO', 'atenciones.editar'),
  ('ABOGADO', 'atenciones.cambiar_estado'),
  ('ABOGADO', 'derivaciones.solicitar'),
  ('ABOGADO', 'gestiones.registrar'),
  ('ABOGADO', 'comites.votar'),
  ('ABOGADO', 'documentos.subir'),
  ('ABOGADO', 'aranceles_atencion.enviar'),
  ('ABOGADO', 'provisiones.solicitar'),
  ('ABOGADO', 'provisiones.registrar_movimientos'),
  ('ABOGADO', 'provisiones.rendir'),
  ('TRAMITADOR', 'afiliados.ver'),
  ('TRAMITADOR', 'afiliados.crear'),
  ('TRAMITADOR', 'atenciones.crear_consulta'),
  ('TRAMITADOR', 'atenciones.crear_caso'),
  ('TRAMITADOR', 'atenciones.editar'),
  ('TRAMITADOR', 'atenciones.cambiar_estado'),
  ('TRAMITADOR', 'derivaciones.solicitar'),
  ('TRAMITADOR', 'gestiones.registrar'),
  ('TRAMITADOR', 'documentos.subir'),
  ('TRAMITADOR', 'pagos.iniciar'),
  ('GERENCIA_FINANZAS', 'afiliados.ver'),
  ('GERENCIA_FINANZAS', 'atenciones.ver_todas'),
  ('GERENCIA_FINANZAS', 'finanzas.ver'),
  ('GERENCIA_FINANZAS', 'aranceles_atencion.registrar_pago'),
  ('GERENCIA_FINANZAS', 'provisiones.registrar_pago'),
  ('GERENCIA_FINANZAS', 'provisiones.registrar_movimientos'),
  ('GERENCIA_FINANZAS', 'provisiones.disponer_entregar'),
  ('GERENCIA_FINANZAS', 'valores_uf.registrar'),
  ('GERENCIA_FINANZAS', 'aranceles.administrar'),
  ('GERENCIA_FINANZAS', 'pagos.iniciar'),
  ('GERENCIA_FINANZAS', 'reportes.ver'),
  ('GERENCIA_FINANZAS', 'exportar.datos'),
  ('CONTADOR', 'afiliados.ver'),
  ('CONTADOR', 'atenciones.ver_todas'),
  ('CONTADOR', 'finanzas.ver'),
  ('CONTADOR', 'aranceles_atencion.registrar_pago'),
  ('CONTADOR', 'provisiones.registrar_pago'),
  ('CONTADOR', 'provisiones.registrar_movimientos'),
  ('ASISTENTE_CONTABLE', 'afiliados.ver'),
  ('ASISTENTE_CONTABLE', 'atenciones.ver_todas'),
  ('ASISTENTE_CONTABLE', 'finanzas.ver'),
  ('ASISTENTE_CONTABLE', 'aranceles_atencion.registrar_pago'),
  ('ASISTENTE_CONTABLE', 'provisiones.registrar_pago'),
  ('ASISTENTE_CONTABLE', 'provisiones.registrar_movimientos'),
  ('COMERCIAL', 'afiliados.ver'),
  ('COMERCIAL', 'atenciones.ver_todas'),
  ('COMERCIAL', 'reportes.ver'),
  ('COMERCIAL', 'exportar.datos'),
  ('ADMINISTRATIVO', 'afiliados.ver'),
  ('ADMINISTRATIVO', 'atenciones.ver_todas'),
  ('AUDITOR', 'afiliados.ver'),
  ('AUDITOR', 'atenciones.ver_todas'),
  ('AUDITOR', 'reportes.ver'),
  ('AUDITOR', 'exportar.datos'),
  ('AUDITOR', 'auditoria.ver'),
  ('AUDITOR', 'webhooks.ver')
) AS v(codigo, permiso) JOIN perfiles p ON p.codigo = v.codigo;
--> statement-breakpoint

-- Rol legado → perfil. Supervisor pasa a Gerencia de Servicios para conservar lo que veía
-- y aprobaba (todas las atenciones); las jefaturas por área quedan para asignar a mano.
UPDATE "usuarios" SET "perfil_id" = p.id
FROM "perfiles" p
WHERE p.codigo = CASE "usuarios"."rol"::text
  WHEN 'Administrador' THEN 'ADMIN'
  WHEN 'Supervisor' THEN 'GERENCIA_SERVICIOS'
  WHEN 'Abogado' THEN 'ABOGADO'
  WHEN 'Operador' THEN 'TRAMITADOR'
  WHEN 'Auditor' THEN 'AUDITOR'
  WHEN 'Contador' THEN 'CONTADOR'
  WHEN 'Finanzas' THEN 'GERENCIA_FINANZAS'
  ELSE 'ADMINISTRATIVO'
END;
--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "perfil_id" SET NOT NULL;--> statement-breakpoint
-- Creador de las atenciones existentes, tomado de la auditoría (si está).
UPDATE "atenciones" a SET "creado_por_id" = x.actor_id
FROM (
  SELECT DISTINCT ON (entidad_id) entidad_id, actor_id
  FROM auditoria
  WHERE entidad = 'atenciones' AND accion = 'CREATE' AND actor_id IS NOT NULL
  ORDER BY entidad_id, "timestamp"
) x
JOIN "usuarios" u ON u.id = x.actor_id
WHERE a.id::text = x.entidad_id AND a.creado_por_id IS NULL;
--> statement-breakpoint
ALTER TABLE "usuarios" DROP COLUMN "rol";--> statement-breakpoint
ALTER TABLE "usuarios" DROP COLUMN "cod_planes";--> statement-breakpoint
DROP TYPE "public"."rol_usuario";