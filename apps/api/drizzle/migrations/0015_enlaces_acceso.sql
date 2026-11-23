CREATE TABLE "enlaces_acceso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enlaces_acceso_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "enlaces_acceso" ADD CONSTRAINT "enlaces_acceso_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enlaces_acceso_usuario_idx" ON "enlaces_acceso" USING btree ("usuario_id","created_at");