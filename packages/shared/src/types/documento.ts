import { z } from "zod";

// Anexo §VI 3.4 / §VII 04 / §VIII: los documentos de la atención se archivan en PDF.
export const MIME_DOCUMENTO = "application/pdf" as const;
export const MAX_BYTES_DOCUMENTO = 100 * 1024 * 1024;

export const SolicitarSubidaSchema = z.object({
  atencionId: z.string().uuid().optional(),
  nombre: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((n) => n.toLowerCase().endsWith(".pdf"), "Solo se aceptan archivos PDF"),
  mimeType: z.literal(MIME_DOCUMENTO, { errorMap: () => ({ message: "Solo se aceptan archivos PDF" }) }),
  tamanoBytes: z.number().int().min(1, "El archivo está vacío").max(MAX_BYTES_DOCUMENTO, "El archivo excede 100 MB"),
});
export type SolicitarSubida = z.infer<typeof SolicitarSubidaSchema>;

export const RegistrarDocumentoSchema = SolicitarSubidaSchema.extend({
  s3Key: z.string().min(1).max(500),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Hash SHA-256 inválido"),
});
export type RegistrarDocumento = z.infer<typeof RegistrarDocumentoSchema>;
