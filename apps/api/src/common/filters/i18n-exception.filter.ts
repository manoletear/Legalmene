import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ZodError } from "zod";
import type { Request, Response } from "express";

// Mapeo de mensajes Zod en inglés a español. Cubre los códigos más comunes.
const ZOD_ES: Record<string, string> = {
  invalid_type: "Tipo inválido",
  invalid_string: "Formato inválido",
  too_small: "Valor muy pequeño",
  too_big: "Valor muy grande",
  invalid_enum_value: "Valor no permitido",
  unrecognized_keys: "Campo no reconocido",
  invalid_date: "Fecha inválida",
  custom: "Validación falló",
};

function traducirZod(error: ZodError): { path: string[]; mensaje: string; codigo: string }[] {
  return error.issues.map((issue) => {
    const codigo = issue.code;
    let mensaje = ZOD_ES[codigo] ?? issue.message;
    // Algunos códigos llevan info útil que vale la pena conservar.
    if (issue.code === "invalid_type") {
      mensaje = `Tipo inválido: esperado ${issue.expected}, recibido ${issue.received}`;
    } else if (issue.code === "too_small") {
      mensaje = `Mínimo permitido: ${issue.minimum}`;
    } else if (issue.code === "too_big") {
      mensaje = `Máximo permitido: ${issue.maximum}`;
    } else if (issue.code === "invalid_enum_value") {
      mensaje = `Valor no permitido. Opciones: ${(issue.options as unknown[]).join(", ")}`;
    } else if (issue.code === "invalid_string" && issue.validation === "regex") {
      mensaje = "Formato inválido";
    } else if (issue.code === "invalid_string" && issue.validation === "email") {
      mensaje = "Email inválido";
    } else if (issue.code === "invalid_string" && issue.validation === "uuid") {
      mensaje = "UUID inválido";
    }
    return { path: issue.path.map(String), mensaje, codigo };
  });
}

// Captura ZodError + HttpException y normaliza el payload de error al español.
// Mantiene shape consistente para que el frontend pueda renderizar uniforme:
// { statusCode, error, message, errores?, timestamp, path }
@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const path = req.originalUrl ?? req.url;

    // ZodError llega envuelto por nestjs-zod como BadRequest con .errors.
    // Detectamos por presencia de issues.
    if (exception instanceof ZodError) {
      const errores = traducirZod(exception);
      res.status(400).json({
        statusCode: 400,
        error: "Bad Request",
        message: "Validación falló",
        errores,
        timestamp: new Date().toISOString(),
        path,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      let message: string;
      let errores: unknown;
      if (typeof r === "string") {
        message = r;
      } else if (typeof r === "object" && r !== null) {
        const obj = r as Record<string, unknown>;
        // nestjs-zod produce { message: 'Validation failed', errors: [...] }
        if (Array.isArray(obj.errors)) {
          const zodLike = {
            issues: obj.errors,
            get message() { return ""; },
          } as unknown as ZodError;
          // re-traducimos los issues
          try {
            errores = traducirZod(zodLike);
            message = "Validación falló";
          } catch {
            message = String(obj.message ?? "Error");
          }
        } else {
          message = String(obj.message ?? "Error");
        }
      } else {
        message = "Error";
      }
      res.status(status).json({
        statusCode: status,
        error: exception.name,
        message,
        ...(errores ? { errores } : {}),
        timestamp: new Date().toISOString(),
        path,
      });
      return;
    }

    // Fallback: error no controlado. Log + 500 sin filtrar detalles.
    const detail = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`Error no controlado en ${path}: ${detail}`, exception instanceof Error ? exception.stack : undefined);
    res.status(500).json({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Ocurrió un error interno",
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
