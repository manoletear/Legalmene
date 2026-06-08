import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export type Rol = "Administrador" | "Supervisor" | "Abogado" | "Operador" | "Auditor";
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
