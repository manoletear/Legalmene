CREATE TABLE "busqueda_indexado" (
	"entidad" varchar(30) PRIMARY KEY NOT NULL,
	"indexado_hasta" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
