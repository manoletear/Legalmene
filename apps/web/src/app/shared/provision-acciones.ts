import type { EstadoProvision, Permiso } from "@legalmene/shared";

// Acción del ciclo de provisión disponible según estado y perfil (Anexo §X).
export interface AccionProvision {
  id: "pago" | "solicitarEntrega" | "autorizar" | "rechazarEntrega" | "disponible" | "entregar" | "gasto" | "reintegro" | "rendir" | "devolucion";
  label: string;
  severidad?: "success" | "danger" | "secondary";
}

// Mismas claves que exige cada endpoint de la API.
const ACCIONES: { estado: EstadoProvision; permiso: Permiso; accion: AccionProvision }[] = [
  { estado: "Solicitada", permiso: "provisiones.registrar_pago", accion: { id: "pago", label: "Registrar pago del cliente" } },
  { estado: "Pagada", permiso: "provisiones.solicitar", accion: { id: "solicitarEntrega", label: "Solicitar entrega" } },
  { estado: "EnAprobacion", permiso: "provisiones.autorizar", accion: { id: "autorizar", label: "Autorizar entrega", severidad: "success" } },
  { estado: "EnAprobacion", permiso: "provisiones.autorizar", accion: { id: "rechazarEntrega", label: "Rechazar", severidad: "danger" } },
  { estado: "Autorizada", permiso: "provisiones.disponer_entregar", accion: { id: "disponible", label: "Marcar disponible" } },
  { estado: "Disponible", permiso: "provisiones.disponer_entregar", accion: { id: "entregar", label: "Registrar entrega" } },
  { estado: "Entregada", permiso: "provisiones.registrar_movimientos", accion: { id: "gasto", label: "Registrar gasto" } },
  { estado: "Entregada", permiso: "provisiones.registrar_movimientos", accion: { id: "reintegro", label: "Reintegrar saldo", severidad: "secondary" } },
  { estado: "Entregada", permiso: "provisiones.rendir", accion: { id: "rendir", label: "Rendir", severidad: "success" } },
  { estado: "Rendida", permiso: "provisiones.disponer_entregar", accion: { id: "devolucion", label: "Registrar devolución", severidad: "secondary" } },
];

export function accionesProvision(estado: EstadoProvision, permisos: ReadonlySet<string>): AccionProvision[] {
  return ACCIONES.filter((a) => a.estado === estado && permisos.has(a.permiso)).map((a) => a.accion);
}
export function severidadProvision(e: EstadoProvision): "success" | "info" | "warn" | "danger" | "secondary" {
  if (e === "Rendida" || e === "Cerrada") return "success";
  if (e === "Rechazada") return "danger";
  if (e === "Entregada" || e === "Disponible") return "info";
  if (e === "Solicitada" || e === "EnAprobacion") return "warn";
  return "secondary";
}
