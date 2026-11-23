CREATE TABLE "ciudades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"region_id" uuid NOT NULL,
	"nombre" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comunas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"region_id" uuid NOT NULL,
	"nombre" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(80) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "afiliados" ADD COLUMN "ciudad" varchar(80);--> statement-breakpoint
ALTER TABLE "ciudades" ADD CONSTRAINT "ciudades_region_id_regiones_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunas" ADD CONSTRAINT "comunas_region_id_regiones_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ciudades_region_nombre_uq" ON "ciudades" USING btree ("region_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "comunas_region_nombre_uq" ON "comunas" USING btree ("region_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "regiones_nombre_uq" ON "regiones" USING btree ("nombre");--> statement-breakpoint
INSERT INTO "regiones" ("nombre") VALUES
  ('Arica y Parinacota'),
  ('Tarapacá'),
  ('Antofagasta'),
  ('Atacama'),
  ('Coquimbo'),
  ('Valparaíso'),
  ('Metropolitana de Santiago'),
  ('Libertador General Bernardo O''Higgins'),
  ('Maule'),
  ('Ñuble'),
  ('Biobío'),
  ('La Araucanía'),
  ('Los Ríos'),
  ('Los Lagos'),
  ('Aysén del General Carlos Ibáñez del Campo'),
  ('Magallanes y de la Antártica Chilena')
ON CONFLICT DO NOTHING;
