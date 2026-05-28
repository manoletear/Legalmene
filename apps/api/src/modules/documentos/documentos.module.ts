import { Module } from "@nestjs/common";
import { DocumentosController } from "./documentos.controller";
import { DocumentosService } from "./documentos.service";
import { S3ClientProvider } from "./s3-client.provider";

@Module({
  controllers: [DocumentosController],
  providers: [DocumentosService, S3ClientProvider],
})
export class DocumentosModule {}
