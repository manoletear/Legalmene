CREATE TABLE "formatos_exportacion" (
	"clave" varchar(40) PRIMARY KEY NOT NULL,
	"columnas" jsonb NOT NULL,
	"actualizado_por_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "formatos_exportacion" ADD CONSTRAINT "formatos_exportacion_actualizado_por_id_usuarios_id_fk" FOREIGN KEY ("actualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;