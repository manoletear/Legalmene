import { z } from "zod";

// Notas internas de la atención (Anexo §IV l.382: el tramitador deja notas para el abogado).
export const CrearNotaSchema = z.object({
  texto: z.string().trim().min(1).max(2000),
  // Sin destinatario la nota avisa al abogado asignado.
  destinatarioId: z.string().uuid().optional(),
});
export type CrearNota = z.infer<typeof CrearNotaSchema>;

export interface NotaAtencion {
  id: string;
  atencionId: string;
  texto: string;
  autorId: string;
  autor: string;
  destinatarioId: string | null;
  destinatario: string | null;
  createdAt: string;
}
