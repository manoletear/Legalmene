import "reflect-metadata";
import { NotifInboxService } from "./modules/notif-inbox/notif-inbox.service";
import { CorreosService } from "./modules/correos/correos.service";
import { plantillaAviso } from "./modules/correos/plantillas";
import { administradores } from "./modules/notif-inbox/destinatarios";
import { DRIZZLE, type Database } from "./db/database.module";
import { hoyChileISO } from "./common/utils/dias-habiles";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "@nestjs/common";
import { ZodValidationPipe } from "nestjs-zod";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { I18nExceptionFilter } from "./common/filters/i18n-exception.filter";
import { contextoMiddleware } from "./common/acceso/contexto";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger("Bootstrap");

  // IP real del cliente: confiar solo en los N proxies propios (ALB, Render). Express toma
  // la entrada de X-Forwarded-For que agregó el proxy más cercano, no la que manda el
  // cliente. La usan el límite de tasa y la auditoría.
  app.set("trust proxy", Number(process.env.TRUSTED_PROXY_HOPS ?? "1"));

  app.setGlobalPrefix("api/v1");

  // Contexto por request: guarda el usuario y sus permisos para acotar las consultas.
  app.use(contextoMiddleware);

  // Headers de seguridad (HSTS, CSP, X-Frame-Options, etc).
  // crossOriginResourcePolicy en "cross-origin" porque el frontend Angular
  // vive en un dominio distinto (CloudFront vs ALB). Si llegan a ser el
  // mismo origin se puede tightenear a "same-origin".
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // Swagger UI necesita inline styles; CSP arriba lo permite con
      // 'unsafe-inline' en styleSrc.
    }),
  );

  app.useGlobalPipes(new ZodValidationPipe());
  // Errores no controlados: aviso en la aplicación a los administradores, uno por ruta y día
  // mientras no lo hayan visto (sin query string, que puede llevar datos).
  const notifInbox = app.get(NotifInboxService);
  const db = app.get<Database>(DRIZZLE);
  const correos = app.get(CorreosService);
  app.useGlobalFilters(
    new I18nExceptionFilter(async (ruta, detalle) => {
      const limpia = ruta.split("?")[0];
      const clave = `${limpia}|${hoyChileISO()}`;
      const admins = await administradores(db);
      let nuevos = 0;
      for (const usuarioId of admins) {
        const creada = await notifInbox.crearSiNoExisteUnseen(
          {
            codPlan: null,
            usuarioId,
            severidad: "critical",
            titulo: "Error de funcionamiento",
            detalle: `${limpia} (${detalle}). El detalle está en el log del servidor.`,
            accionUrl: "/auditoria",
            metadata: { errorServidor: clave },
          },
          "errorServidor",
          clave,
        );
        if (creada) nuevos++;
      }
      // Correo a los administradores solo la primera vez de esa ruta en el día.
      if (nuevos) {
        await correos.aUsuarios(admins, plantillaAviso({ titulo: "Error de funcionamiento en NEXUS", detalle: `${limpia} (${detalle}). El detalle está en el log del servidor.`, url: correos.url("/auditoria") }), {
          plantilla: "sistema.error",
        });
      }
    }),
  );

  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:4200").split(",").map((o) => o.trim()),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("NEXUS API (Legal Chile)")
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
