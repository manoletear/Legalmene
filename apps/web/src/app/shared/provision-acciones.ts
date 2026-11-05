import type { EstadoProvision } from "@legalmene/shared";

// Acción del ciclo de provisión disponible según estado y perfil (Anexo §X).
export interface AccionProvision {
  id: "pago" | "solicitarEntrega" | "autorizar" | "rechazarEntrega" | "disponible" | "entregar" | "gasto" | "reintegro" | "rendir" | "devolucion";
  label: string;
  severidad?: "success" | "danger" | "secondary";
}

const ACCIONES: { estado: EstadoProvision; roles: string[]; accion: AccionProvision }[] = [
  { estado: "Solicitada", roles: ["Administrador", "Contador"], accion: { id: "pago", label: "Registrar pago del cliente" } },
  { estado: "Pagada", roles: ["Administrador", "Supervisor", "Abogado"], accion: { id: "solicitarEntrega", label: "Solicitar entrega" } },
  { estado: "EnAprobacion", roles: ["Administrador", "Supervisor"], accion: { id: "autorizar", label: "Autorizar entrega", severidad: "success" } },
  { estado: "EnAprobacion", roles: ["Administrador", "Supervisor"], accion: { id: "rechazarEntrega", label: "Rechazar", severidad: "danger" } },
  { estado: "Autorizada", roles: ["Administrador", "Finanzas"], accion: { id: "disponible", label: "Marcar disponible" } },
  { estado: "Disponible", roles: ["Administrador", "Finanzas"], accion: { id: "entregar", label: "Registrar entrega" } },
  { estado: "Entregada", roles: ["Administrador", "Supervisor", "Abogado"], accion: { id: "gasto", label: "Registrar gasto" } },
  { estado: "Entregada", roles: ["Administrador", "Supervisor", "Abogado", "Contador"], accion: { id: "reintegro", label: "Reintegrar saldo", severidad: "secondary" } },
  { estado: "Entregada", roles: ["Administrador", "Supervisor", "Abogado"], accion: { id: "rendir", label: "Rendir", severidad: "success" } },
  { estado: "Rendida", roles: ["Administrador", "Finanzas"], accion: { id: "devolucion", label: "Registrar devolución", severidad: "secondary" } },
];

export function accionesProvision(estado: EstadoProvision, rol: string | undefined): AccionProvision[] {
  return ACCIONES.filter((a) => a.estado === estado && a.roles.includes(rol ?? "")).map((a) => a.accion);
}

export function severidadProvision(e: EstadoProvision): "success" | "info" | "warn" | "danger" | "secondary" {
  if (e === "Rendida" || e === "Cerrada") return "success";
  if (e === "Rechazada") return "danger";
  if (e === "Entregada" || e === "Disponible") return "info";
  if (e === "Solicitada" || e === "EnAprobacion") return "warn";
  return "secondary";
}
