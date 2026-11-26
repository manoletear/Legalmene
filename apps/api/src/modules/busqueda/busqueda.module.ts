import { Global, Module } from "@nestjs/common";
import { BusquedaController } from "./busqueda.controller";
import { OpenSearchService } from "./opensearch.service";

// Búsqueda de texto completo con OpenSearch (opcional; sin OPENSEARCH_URL se usa Postgres).
@Global()
@Module({
  controllers: [BusquedaController],
  providers: [OpenSearchService],
  exports: [OpenSearchService],
})
export class BusquedaModule {}
