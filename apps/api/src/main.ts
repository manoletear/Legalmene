import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { ZodValidationPipe } from "nestjs-zod";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { I18nExceptionFilter } from "./common/filters/i18n-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new I18nExceptionFilter());

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:4200",
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("LegalChile PSL API")
    .setDescription("Sistema de gestión legal — Atenciones, Afiliados, Comité, Pagos")
    .setVersion("0.1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT", in: "header" },
      "EntraID",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs:    http://localhost:${port}/api/docs`);
}

bootstrap();
