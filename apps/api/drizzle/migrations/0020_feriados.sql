CREATE TABLE "feriados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha" date NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"origen" varchar(10) DEFAULT 'Manual' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feriados_fecha_uq" ON "feriados" USING btree ("fecha");