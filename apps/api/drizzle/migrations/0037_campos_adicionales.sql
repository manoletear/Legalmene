CREATE TABLE "campos_adicionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etiqueta" varchar(120) NOT NULL,
	"tipo_dato" varchar(10) NOT NULL,
	"opciones" jsonb,
	"obligatorio" boolean DEFAULT false NOT NULL,
	"tipo_atencion" "tipo_atencion",
	"materia_id" uuid,
	"procedimiento_id" uuid,
	"orden" integer DEFAULT 0 NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atenciones" ADD COLUMN "campos_adicionales" jsonb;--> statement-breakpoint
ALTER TABLE "campos_adicionales" ADD CONSTRAINT "campos_adicionales_materia_id_materias_id_fk" FOREIGN KEY ("materia_id") REFERENCES "public"."materias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_adicionales" ADD CONSTRAINT "campos_adicionales_procedimiento_id_procedimientos_id_fk" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campos_adicionales_materia_idx" ON "campos_adicionales" USING btree ("materia_id");--> statement-breakpoint
CREATE INDEX "campos_adicionales_procedimiento_idx" ON "campos_adicionales" USING btree ("procedimiento_id");