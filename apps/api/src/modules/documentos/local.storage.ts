import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import { mkdirSync, existsSync, statSync, createWriteStream, createReadStream } from "fs";
import { resolve, join, dirname } from "path";
import { Request, Response } from "express";
import { DocumentStorage } from "./storage.interface";

// Backend local para dev: emite URLs firmadas con HMAC apuntando a endpoints
// del propio API. Sirve para probar el flujo sin S3/LocalStack.
@Injectable()
export class LocalStorage implements DocumentStorage {
  readonly bucketName = "legalmene-local";
  private readonly logger = new Logger(LocalStorage.name);
  private readonly root: string;
  private readonly secret: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>("DOCUMENTS_LOCAL_DIR") ?? "./data/docs");
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
    this.secret = config.get<string>("DOCUMENTS_LOCAL_SECRET") ?? "dev-only-secret";
    const apiUrl = config.get<string>("API_PUBLIC_URL") ?? `http://localhost:${config.get<string>("PORT") ?? "3001"}`;
    this.publicBase = `${apiUrl.replace(/\/$/, "")}/api/v1/documentos/local`;
    this.logger.log(`LocalStorage activo en ${this.root}`);
  }

  async generateUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSec: number;
  }): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + input.expiresInSec;
    const sig = this.sign("PUT", input.key, exp);
    return `${this.publicBase}/${encodeURIComponent(input.key)}?exp=${exp}&sig=${sig}`;
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
    const sig = this.sign("GET", input.key, exp);
    return `${this.publicBase}/${encodeURIComponent(input.key)}?exp=${exp}&sig=${sig}&download=${encodeURIComponent(input.filename)}`;
  }

  // Handlers para los endpoints /documentos/local/:key
  async handlePut(req: Request, res: Response, key: string): Promise<void> {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig);
    if (!this.verify("PUT", key, exp, sig)) {
      res.status(403).json({ message: "URL firmada inválida o expirada" });
      return;
    }
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    await new Promise<void>((resolveFn, rejectFn) => {
      const ws = createWriteStream(path);
      req.pipe(ws);
      ws.on("finish", () => resolveFn());
      ws.on("error", rejectFn);
      req.on("error", rejectFn);
    });
    res.status(200).json({ ok: true, bytes: statSync(path).size });
  }

  handleGet(req: Request, res: Response, key: string): void {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig);
    if (!this.verify("GET", key, exp, sig)) {
      res.status(403).json({ message: "URL firmada inválida o expirada" });
      return;
    }
    const path = this.pathFor(key);
    if (!existsSync(path)) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    const download = req.query.download as string | undefined;
    if (download) res.setHeader("Content-Disposition", `attachment; filename="${download}"`);
    createReadStream(path).pipe(res);
  }

  private sign(method: string, key: string, exp: number): string {
    return createHmac("sha256", this.secret).update(`${method}:${key}:${exp}`).digest("hex");
  }

  private verify(method: string, key: string, exp: number, sig: string): boolean {
    if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
    return this.sign(method, key, exp) === sig;
  }

  private pathFor(key: string): string {
    // Evita path traversal: la key se sanitizó antes pero igual normalizamos.
    const safe = key.replace(/\.\./g, "_");
    return join(this.root, safe);
  }
}
