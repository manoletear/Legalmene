import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";
import { DRIZZLE, Database } from "../../db/database.module";
import { documentos, Documento, NuevoDocumento } from "../../db/schema/documentos";
import { atenciones } from "../../db/schema/atenciones";
import { and } from "drizzle-orm";
import { S3_CLIENT } from "./s3-client.provider";

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
  private readonly bucket: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>("S3_DOCUMENTS_BUCKET") ?? "legalmene-dev-documents";
  }

  // Genera URL firmada para que el cliente suba directamente a S3 (no pasa por API).
  // Cliente PUT a uploadUrl con Content-Type y body; luego llama POST /documentos para registrar.
  async generateUploadUrl(codPlan: string, input: UploadUrlRequest): Promise<UploadUrlResponse> {
    if (input.tamanoBytes > 100 * 1024 * 1024) {
      throw new BadRequestException("Archivo excede 100 MB");
    }
    if (input.atencionId) {
      await this.assertAtencionEnPlan(codPlan, input.atencionId);
    }

    // Path: <plan>/<año>/<atencion-id>/<ulid>-<filename>
    const anio = new Date().getUTCFullYear();
    const atencionSeg = input.atencionId ?? "sin-atencion";
    const safeName = input.nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `${codPlan}/${anio}/${atencionSeg}/${ulid()}-${safeName}`;

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: input.mimeType,
      ContentLength: input.tamanoBytes,
    });
    const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: 900 });
    return { uploadUrl, s3Key, expiresInSec: 900 };
  }

  // Registra el metadata después de que el cliente confirma el upload a S3.
  async register(codPlan: string, input: RegisterDocRequest): Promise<Documento> {
    if (input.atencionId) {
      await this.assertAtencionEnPlan(codPlan, input.atencionId);
    }
    // Verifica que el objeto exista en S3 antes de registrar.
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.s3Key }));
    } catch {
      throw new BadRequestException(`Objeto ${input.s3Key} no existe en bucket ${this.bucket}`);
    }

    const payload: NuevoDocumento = {
      atencionId: input.atencionId ?? null,
      nombre: input.nombre,
      mimeType: input.mimeType,
      tamanoBytes: input.tamanoBytes,
      s3Bucket: this.bucket,
      s3Key: input.s3Key,
      sha256: input.sha256,
      subidoPor: input.subidoPor,
    };
    const [row] = await this.db.insert(documentos).values(payload).returning();
    return row;
  }

  async generateDownloadUrl(codPlan: string, id: string): Promise<{ url: string; expiresInSec: number }> {
    const [doc] = await this.db.select().from(documentos).where(eq(documentos.id, id));
    if (!doc) throw new NotFoundException(`Documento ${id} no existe`);
    if (doc.atencionId) {
      await this.assertAtencionEnPlan(codPlan, doc.atencionId);
    }
    const cmd = new GetObjectCommand({
      Bucket: doc.s3Bucket,
      Key: doc.s3Key,
      ResponseContentDisposition: `attachment; filename="${doc.nombre}"`,
    });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: 600 });
    return { url, expiresInSec: 600 };
  }

  async listarPorAtencion(codPlan: string, atencionId: string): Promise<Documento[]> {
    await this.assertAtencionEnPlan(codPlan, atencionId);
    return this.db.select().from(documentos).where(eq(documentos.atencionId, atencionId));
  }

  private async assertAtencionEnPlan(codPlan: string, atencionId: string) {
    const [a] = await this.db
      .select({ id: atenciones.id })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), eq(atenciones.codPlan, codPlan)));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe en plan ${codPlan}`);
  }
}
