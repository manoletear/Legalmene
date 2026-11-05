import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject, signal } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { etiquetaPermiso, type Permiso } from "@legalmene/shared";
import { MeService } from "./services/me.service";

// Guard de ruta: sin el permiso vuelve al dashboard con un aviso.
export function permisoGuard(...permisos: Permiso[]): CanActivateFn {
  return async () => {
    const me = inject(MeService);
    const router = inject(Router);
    const msg = inject(MessageService);
    await me.asegurar();
    if (me.algunoDe(permisos)) return true;
    msg.add({
      severity: "warn",
      summary: "Sin acceso",
      detail: `Su perfil no tiene el permiso "${etiquetaPermiso(permisos[0])}"`,
      life: 4000,
    });
    return router.parseUrl("/dashboard");
  };
}

// *lmPermiso="'clave'" o *lmPermiso="['a', 'b']" (basta uno): muestra el bloque si el
// usuario tiene el permiso.
@Directive({ selector: "[lmPermiso]", standalone: true })
export class PermisoDirective {
  private tpl = inject(TemplateRef<unknown>);
  private vcr = inject(ViewContainerRef);
  private me = inject(MeService);
  private requeridos = signal<Permiso[]>([]);
  private visible = false;

  @Input() set lmPermiso(p: Permiso | Permiso[]) {
    this.requeridos.set(Array.isArray(p) ? p : [p]);
  }

  constructor() {
    effect(() => {
      const ok = this.me.algunoDe(this.requeridos());
      if (ok && !this.visible) this.vcr.createEmbeddedView(this.tpl);
      if (!ok && this.visible) this.vcr.clear();
      this.visible = ok;
    });
  }
}
