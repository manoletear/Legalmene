ALTER TABLE "provisiones" ADD COLUMN "cuotas_pago_cliente" integer;--> statement-breakpoint
ALTER TABLE "provisiones" ADD COLUMN "referencia_pago_cliente" varchar(80);--> statement-breakpoint
ALTER TABLE "aranceles_atencion" ADD COLUMN "cuotas_pago" integer;--> statement-breakpoint
ALTER TABLE "aranceles_atencion" ADD COLUMN "referencia_pago" varchar(80);