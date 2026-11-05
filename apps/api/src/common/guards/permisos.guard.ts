import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { etiquetaPermiso, type Permiso } from "@legalmene/shared";
import { PERMISO_KEY } from "../decorators/permiso.decorator";
import type { AuthenticatedUser } from "../decorators/current-user.decorator";

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requerido = this.reflector.getAllAndOverride<Permiso | undefined>(PERMISO_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requerido) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.permisos.includes(requerido)) {
      throw new ForbiddenException(`Su perfil no tiene el permiso "${etiquetaPermiso(requerido)}"`);
    }
    return true;
  }
}
