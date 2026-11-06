import { SetMetadata } from "@nestjs/common";
import type { Permiso as ClavePermiso } from "@legalmene/shared";

export const PERMISO_KEY = "permiso";

// Exige una clave del catálogo PERMISOS. Usar junto a JwtAuthGuard + PermisosGuard.
export const Permiso = (clave: ClavePermiso) => SetMetadata(PERMISO_KEY, clave);
