import { z } from "zod";

// Plazos del Anexo que corren en días hábiles (la API los calcula con feriados).
export const PLAZO_CONTACTO_DIAS_HABILES = 1; // §VII l.765, §VIII l.984: contacto con el cliente ≤ 24 h hábiles
export const PLAZO_PRIMERA_PRESENTACION_DIAS_HABILES = 5; // §VIII l.1106: desde el pago del arancel
export const PLAZO_RENDICION_DIAS_HABILES = 8; // §X l.1722: rendir los fondos entregados

export const TipoPlazoEnum = z.enum(["ContactoCliente", "PrimeraPresentacion", "RendicionFondos"]);
export type TipoPlazo = z.infer<typeof TipoPlazoEnum>;

export const TIPO_PLAZO_LABEL: Record<TipoPlazo, string> = {
  ContactoCliente: "Contacto con el cliente",
  PrimeraPresentacion: "Primera presentación del juicio",
  RendicionFondos: "Rendición de fondos entregados",
};

export const EstadoPlazoEnum = z.enum(["Pendiente", "Vencido", "Cumplido", "CumplidoFueraDePlazo"]);
export type EstadoPlazo = z.infer<typeof EstadoPlazoEnum>;

export interface PlazoAtencion {
  tipo: TipoPlazo;
  // Desde cuándo corre y cuándo vence (ISO, fin de la jornada en Chile).
  desde: string;
  limite: string;
  cumplidoEn: string | null;
  estado: EstadoPlazo;
  // Provisión a la que se refiere (rendición de fondos).
  referenciaId?: string;
}

export const RegistrarContactoSchema = z.object({
  // Momento del contacto; sin él, ahora.
  fecha: z.string().datetime().optional(),
});
export type RegistrarContacto = z.infer<typeof RegistrarContactoSchema>;
