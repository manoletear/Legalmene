import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { mkdirSync, existsSync, statSync, createWriteStream, createReadStream, unlinkSync } from "fs";
import { resolve, join, dirname } from "path";
import { Request, Response } from "express";
import { DocumentStorage } from "./storage.interface";

// Backend local para dev y la demo: emite URLs firmadas con HMAC apuntando a endpoints
// del propio API. Sirve para probar el flujo sin S3/LocalStack. Solo atiende si
// STORAGE_BACKEND=local, y en ese caso exige DOCUMENTS_LOCAL_SECRET (sin secreto por defecto).
@Injectable()
export class LocalStorage implements DocumentStorage {
  readonly bucketName = "legalmene-local";
  private readonly logger = new Logger(LocalStorage.name);
  private readonly root: string;
  private readonly secret: string;
  private readonly publicBase: string;
  readonly activo: boolean;

  constructor(config: ConfigService) {
    this.activo = (config.get<string>("STORAGE_BACKEND") ?? "s3") === "local";
    this.root = resolve(config.get<string>("DOCUMENTS_LOCAL_DIR") ?? "./data/docs");
    this.secret = config.get<string>("DOCUMENTS_LOCAL_SECRET") ?? "";
    const apiUrl = config.get<string>("API_PUBLIC_URL") ?? `http://localhost:${config.get<string>("PORT") ?? "3001"}`;
    this.publicBase = `${apiUrl.replace(/\/$/, "")}/api/v1/documentos/local`;
    if (!this.activo) return;
    if (this.secret.length < 8) {
      throw new Error("STORAGE_BACKEND=local exige DOCUMENTS_LOCAL_SECRET (mínimo 8 caracteres)");
    }
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
    this.logger.log(`LocalStorage activo en ${this.root}`);
  }

  async generateUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSec: number;
  }): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + input.expiresInSec;
    const len = Math.max(0, Math.floor(input.contentLength));
    const sig = this.sign("PUT", input.key, exp, String(len));
    return `${this.publicBase}/${encodeURIComponent(input.key)}?exp=${exp}&len=${len}&sig=${sig}`;
  }

  async exists(key: string): Promise<boolean> {
    const path = this.pathFor(key);
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }

  async generateDownloadUrl(input: {
    key: string;
    filename: string;
    expiresInSec: number;
  }): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + input.expiresInSec;
    // El nombre de descarga va firmado: quien tiene la URL no puede cambiarlo.
    const sig = this.sign("GET", input.key, exp, input.filename);
    return `${this.publicBase}/${encodeURIComponent(input.key)}?exp=${exp}&sig=${sig}&download=${encodeURIComponent(input.filename)}`;
  }

  // Handlers para los endpoints /documentos/local/:key
  async handlePut(req: Request, res: Response, key: string): Promise<void> {
    if (!this.activo) {
      res.status(404).json({ message: "No encontrado" });
      return;
    }
    const exp = Number(req.query.exp);
    const len = Number(req.query.len);
    const sig = String(req.query.sig);
    if (!Number.isInteger(len) || len < 0 || !this.verify("PUT", key, exp, sig, String(len))) {
      res.status(403).json({ message: "URL firmada inválida o expirada" });
      return;
    }
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    let bytes = 0;
    let excedido = false;
    await new Promise<void>((resolveFn, rejectFn) => {
      const ws = createWriteStream(path);
      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > len && !excedido) {
          excedido = true;
          req.unpipe(ws);
          ws.end();
          req.resume();
        }
      });
      req.pipe(ws);
      ws.on("finish", () => resolveFn());
      ws.on("error", rejectFn);
      req.on("error", rejectFn);
    });
    if (excedido) {
      unlinkSync(path);
      res.status(413).json({ message: "El archivo excede el tamaño declarado" });
      return;
    }
    res.status(200).json({ ok: true, bytes: statSync(path).size });
  }

  handleGet(req: Request, res: Response, key: string): void {
    if (!this.activo) {
      res.status(404).json({ message: "No encontrado" });
      return;
    }
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig);
    const download = String(req.query.download ?? "");
    if (!this.verify("GET", key, exp, sig, download)) {
      res.status(403).json({ message: "URL firmada inválida o expirada" });
      return;
    }
    const path = this.pathFor(key);
    if (!existsSync(path)) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    // Siempre como descarga y sin interpretar el contenido en el origen del API.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", contentDisposition(download || "documento"));
    createReadStream(path).pipe(res);
  }

  private sign(method: string, key: string, exp: number, extra: string): string {
    return createHmac("sha256", this.secret).update(`${method}:${key}:${exp}:${extra}`).digest("hex");
  }

  private verify(method: string, key: string, exp: number, sig: string, extra: string): boolean {
    if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
    const esperada = Buffer.from(this.sign(method, key, exp, extra), "hex");
    const recibida = Buffer.from(/^[0-9a-f]{64}$/.test(sig) ? sig : "", "hex");
    return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
  }

  private pathFor(key: string): string {
    // Evita path traversal: la key se sanitizó antes pero igual normalizamos.
    const safe = key.replace(/\.\./g, "_");
    return join(this.root, safe);
  }
}

// Content-Disposition seguro: nombre ASCII sin comillas ni separadores + filename* (RFC 5987).
export function contentDisposition(nombre: string): string {
  const ascii = nombre.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 150) || "documento";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre.slice(0, 150))}`;
}
