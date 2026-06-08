import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DocumentosController } from "./documentos.controller";
import { DocumentosService } from "./documentos.service";
import { S3ClientProvider } from "./s3-client.provider";
import { S3Storage } from "./s3.storage";
import { LocalStorage } from "./local.storage";
import { DOC_STORAGE } from "./storage.token";

@Module({
  imports: [ConfigModule],
  controllers: [DocumentosController],
  providers: [
    DocumentosService,
    S3ClientProvider,
    S3Storage,
    LocalStorage,
    {
      provide: DOC_STORAGE,
      inject: [ConfigService, S3Storage, LocalStorage],
      // STORAGE_BACKEND=local en dev sin AWS; "s3" (default) en prod.
      useFactory: (config: ConfigService, s3: S3Storage, local: LocalStorage) => {
        const backend = config.get<string>("STORAGE_BACKEND") ?? "s3";
        return backend === "local" ? local : s3;
      },
    },
  ],
})
export class DocumentosModule {}
