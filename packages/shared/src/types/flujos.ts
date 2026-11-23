import { z } from "zod";
import { TipoGestionEnum } from "./gestion";

// Derivación consulta → asesoría/juicio con aprobación de jefatura (Anexo §VI 3.9).
export const EstadoDerivacionEnum = z.enum(["Solicitada", "Aprobada", "Rechazada"]);
export type EstadoDerivacion = z.infer<typeof EstadoDerivacionEnum>;

export const SolicitarDerivacionSchema = z.object({
  nuevoTipo: z.enum(["Asesoria", "Juicio"]),
  motivo: z.string().trim().min(5).max(1000),
});
export type SolicitarDerivacion = z.infer<typeof SolicitarDerivacionSchema>;

// Al aprobar, la jefatura puede corregir la materia (si la original no aplica al nuevo tipo)
// y elegir el abogado de destino.
export const AprobarDerivacionSchema = z.object({
  materiaId: z.string().uuid().optional(),
  competenciaId: z.string().uuid().optional(),
  abogadoDestinoId: z.string().uuid().optional(),
  observacion: z.string().max(2000).optional(),
});
export type AprobarDerivacion = z.infer<typeof AprobarDerivacionSchema>;

export const RechazarDerivacionSchema = z.object({
  observacion: z.string().trim().min(3).max(2000),
});
export type RechazarDerivacion = z.infer<typeof RechazarDerivacionSchema>;

export interface DerivacionRow {
  id: string;
  consultaId: string;
  consultaCorrelativo: string;
  asunto: string;
  nuevoTipo: "Asesoria" | "Juicio";
  motivo: string;
  estado: EstadoDerivacion;
  solicitadaPorEmail: string;
  observacion: string | null;
  atencionDerivadaId: string | null;
  createdAt: string;
  resueltaAt: string | null;
}

// Contraparte de un juicio/asesoría (Anexo §VIII, pestaña Contraparte).
export const ContraparteSchema = z.object({
  id: z.string().uuid(),
  atencionId: z.string().uuid(),
  nombre: z.string().trim().min(1).max(200),
  rut: z.string().max(12).optional().nullable(),
  representanteLegal: z.string().max(200).optional().nullable(),
  abogadoNombre: z.string().max(200).optional().nullable(),
  abogadoEmail: z.string().email().max(200).optional().nullable(),
  abogadoTelefono: z.string().max(30).optional().nullable(),
  vigente: z.boolean(),
});
export type Contraparte = z.infer<typeof ContraparteSchema>;

export const CreateContraparteSchema = ContraparteSchema.omit({ id: true, atencionId: true, vigente: true });
export type CreateContraparte = z.infer<typeof CreateContraparteSchema>;
export const UpdateContraparteSchema = CreateContraparteSchema.partial();
export type UpdateContraparte = z.infer<typeof UpdateContraparteSchema>;

// Gestiones predefinidas por materia o procedimiento, con orden y plazo (Anexo §XIV).
export const GestionPlantillaSchema = z.object({
  id: z.string().uuid(),
  materiaId: z.string().uuid().nullable(),
  procedimientoId: z.string().uuid().nullable(),
  orden: z.number().int().min(1),
  titulo: z.string().trim().min(1).max(200),
  tipo: TipoGestionEnum,
  plazoDiasHabiles: z.number().int().min(0).max(365),
  vigente: z.boolean(),
});
export type GestionPlantilla = z.infer<typeof GestionPlantillaSchema>;

export const CreateGestionPlantillaSchema = GestionPlantillaSchema.omit({ id: true })
  .partial({ vigente: true, materiaId: true, procedimientoId: true })
  .refine((v) => Boolean(v.materiaId) || Boolean(v.procedimientoId), {
    message: "Indique materia o procedimiento",
  });
export type CreateGestionPlantilla = z.infer<typeof CreateGestionPlantillaSchema>;
export const UpdateGestionPlantillaSchema = GestionPlantillaSchema.omit({ id: true }).partial();
export type UpdateGestionPlantilla = z.infer<typeof UpdateGestionPlantillaSchema>;
