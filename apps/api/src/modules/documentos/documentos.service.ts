import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DRIZZLE, Database } from "../../db/database.module";
import { documentos, Documento, NuevoDocumento } from "../../db/schema/documentos";
import { atenciones } from "../../db/schema/atenciones";
import { DOC_STORAGE } from "./storage.token";
import { DocumentStorage } from "./storage.interface";

export interface UploadUrlRequest {
  atencionId?: string;
  nombre: string;
  mimeType: string;
  tamanoBytes: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresInSec: number;
}

export interface RegisterDocRequest {
  atencionId?: string;
  nombre: string;
  mimeType: string;
  tamanoBytes: number;
  s3Key: string;
  sha256: string;
  subidoPor: string;
}

@Injectable()
export class DocumentosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(DOC_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  async generateUploadUrl(input: UploadUrlRequest): Promise<UploadUrlResponse> {
    if (input.tamanoBytes > 100 * 1024 * 1024) {
      throw new BadRequestException("Archivo excede 100 MB");
    }
    if (input.atencionId) {
      await this.assertAtencion(input.atencionId);
    }
    const anio = new Date().getUTCFullYear();
    const atencionSeg = input.atencionId ?? "sin-atencion";
    const safeName = input.nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `atenciones/${anio}/${atencionSeg}/${ulid()}-${safeName}`;
    const expiresInSec = 900;
    const uploadUrl = await this.storage.generateUploadUrl({
      key: s3Key,
      contentType: input.mimeType,
      contentLength: input.tamanoBytes,
      expiresInSec,
    });
    return { uploadUrl, s3Key, expiresInSec };
  }

  async register(input: RegisterDocRequest): Promise<Documento> {
    if (input.atencionId) {
      await this.assertAtencion(input.atencionId);
    }
    if (!(await this.storage.exists(input.s3Key))) {
      throw new BadRequestException(`Objeto ${input.s3Key} no existe en el storage`);
    }
    const payload: NuevoDocumento = {
      atencionId: input.atencionId ?? null,
      nombre: input.nombre,
      mimeType: input.mimeType,
      tamanoBytes: input.tamanoBytes,
      s3Bucket: this.storage.bucketName,
      s3Key: input.s3Key,
      sha256: input.sha256,
      subidoPor: input.subidoPor,
    };
    const [row] = await this.db.insert(documentos).values(payload).returning();
    return row;
  }

  async generateDownloadUrl(
    id: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    const [doc] = await this.db.select().from(documentos).where(eq(documentos.id, id));
    if (!doc) throw new NotFoundException(`Documento ${id} no existe`);
    const url = await this.storage.generateDownloadUrl({
      key: doc.s3Key,
      filename: doc.nombre,
      expiresInSec: 600,
    });
    return { url, expiresInSec: 600 };
  }

  async listarPorAtencion(atencionId: string): Promise<Documento[]> {
    await this.assertAtencion(atencionId);
    return this.db.select().from(documentos).where(eq(documentos.atencionId, atencionId));
  }

  private async assertAtencion(atencionId: string) {
    const [a] = await this.db
      .select({ id: atenciones.id })
      .from(atenciones)
      .where(eq(atenciones.id, atencionId));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
  }
}
