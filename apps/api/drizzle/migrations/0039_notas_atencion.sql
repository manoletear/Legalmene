CREATE TABLE "notas_atencion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"autor_id" uuid NOT NULL,
	"destinatario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_atencion" ADD CONSTRAINT "notas_atencion_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_atencion" ADD CONSTRAINT "notas_atencion_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_atencion" ADD CONSTRAINT "notas_atencion_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notas_atencion_atencion_idx" ON "notas_atencion" USING btree ("atencion_id","created_at");