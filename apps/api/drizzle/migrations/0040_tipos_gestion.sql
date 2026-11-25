CREATE TABLE "tipos_gestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"categoria" varchar(30) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materias" ADD COLUMN "provision_estimada_clp" integer;--> statement-breakpoint
ALTER TABLE "gestiones" ADD COLUMN "tipo_gestion_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_gestion_nombre_uq" ON "tipos_gestion" USING btree ("nombre");--> statement-breakpoint
INSERT INTO "tipos_gestion" ("nombre", "categoria") VALUES
  ('Llamada telefónica', 'LlamadaTelefonica'),
  ('Correo electrónico', 'Email'),
  ('Reunión / entrevista', 'Reunion'),
  ('Escrito judicial', 'EscritoJudicial'),
  ('Audiencia', 'Audiencia'),
  ('Notificación', 'Notificacion'),
  ('Análisis documental', 'AnalisisDocumental'),
  ('Resolución', 'Resolucion'),
  ('Otra', 'Otra')
ON CONFLICT DO NOTHING;
