import { EntraService } from "../../core/services/entra.service";
import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { HttpErrorResponse } from "@angular/common/http";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MINUTOS_VALIDEZ_ENLACE } from "@legalmene/shared";
import { SesionService } from "../../core/services/sesion.service";
import { MeService } from "../../core/services/me.service";

type Paso = "correo" | "enviado" | "verificando" | "error";

// Ingreso sin contraseña: el usuario recibe por correo un enlace de un solo uso.
@Component({
  selector: "lm-login",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <div class="lm-login">
      <section class="lm-login-panel">
        <div class="lm-login-marca">
          <img class="lm-brand-mark" src="assets/nexus-logo.png" alt="" />
          <div>
            <strong>NEXUS</strong>
            <small>Legal Chile</small>
          </div>
        </div>
        <h1>Plataforma Integral de Gestión Legal</h1>
        <p>Ingresa con tu correo institucional. Te enviaremos un enlace seguro, sin contraseñas.</p>
      </section>

      <section class="lm-login-card" [ngSwitch]="paso()">
        <form *ngSwitchCase="'correo'" (ngSubmit)="enviar()" novalidate>
          <h2>Iniciar sesión</h2>
          <ng-container *ngIf="entra.configurado">
            <button pButton type="button" label="Ingresar con Microsoft" icon="pi pi-microsoft" [outlined]="true"
              [loading]="conMicrosoft()" (click)="ingresarMicrosoft()" data-testid="login-microsoft"></button>
            <p class="lm-small lm-login-separador">o con un enlace a tu correo</p>
          </ng-container>
          <label for="lm-login-email">Correo electrónico</label>
          <input
            id="lm-login-email"
            pInputText
            type="email"
            name="email"
            autocomplete="email"
            placeholder="nombre@legalchile.cl"
            [(ngModel)]="email"
            required
            autofocus
          />
          <small class="lm-login-error" *ngIf="mensaje()" role="alert">{{ mensaje() }}</small>
          <button pButton type="submit" label="Enviar enlace de acceso" icon="pi pi-send" [loading]="enviando()"></button>
          <p class="lm-small">El enlace vence en {{ minutos }} minutos y sirve una sola vez.</p>
        </form>

        <div *ngSwitchCase="'enviado'" class="lm-login-estado">
          <i class="pi pi-envelope"></i>
          <h2>Revisa tu correo</h2>
          <p>Si <strong>{{ email }}</strong> tiene acceso a la plataforma, recibirás un enlace para ingresar en unos segundos.</p>
          <div class="lm-login-demo" *ngIf="enlaceDemo() as enlace">
            <p>Modo demo: no se envían correos. Usa este enlace para ingresar.</p>
            <a pButton [href]="enlace" label="Abrir enlace de acceso" icon="pi pi-sign-in"></a>
          </div>
          <button pButton type="button" [text]="true" label="Usar otro correo" (click)="volver()"></button>
        </div>

        <div *ngSwitchCase="'verificando'" class="lm-login-estado">
          <i class="pi pi-spin pi-spinner"></i>
          <h2>Validando tu enlace…</h2>
        </div>

        <div *ngSwitchCase="'error'" class="lm-login-estado">
          <i class="pi pi-exclamation-circle lm-login-icono-error"></i>
          <h2>No pudimos validar el enlace</h2>
          <p>{{ mensaje() }}</p>
          <a pButton routerLink="/login" label="Solicitar un enlace nuevo" (click)="volver()"></a>
        </div>
      </section>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private sesion = inject(SesionService);
  protected entra = inject(EntraService);
  private me = inject(MeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly minutos = MINUTOS_VALIDEZ_ENLACE;
  protected email = "";
  protected paso = signal<Paso>("correo");
  protected enviando = signal(false);
  protected mensaje = signal("");
  protected enlaceDemo = signal<string | null>(null);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get("token");
    if (this.route.snapshot.url.some((s) => s.path === "verificar")) {
      if (token) this.verificar(token);
      else this.fallar("El enlace está incompleto. Solicite uno nuevo.");
    }
  }

  protected conMicrosoft = signal(false);

  // Ingreso con la cuenta Microsoft de LegalChile (Entra ID).
  protected async ingresarMicrosoft() {
    this.mensaje.set("");
    this.conMicrosoft.set(true);
    try {
      if (!(await this.entra.ingresar())) return;
      this.me.reiniciar();
      this.me.load();
      void this.router.navigateByUrl("/dashboard", { replaceUrl: true });
    } catch {
      this.mensaje.set("No pudimos ingresar con Microsoft. Inténtalo de nuevo o usa el enlace por correo.");
    } finally {
      this.conMicrosoft.set(false);
    }
  }

  protected enviar() {
    const email = this.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.mensaje.set("Ingresa un correo válido.");
      return;
    }
    this.mensaje.set("");
    this.enviando.set(true);
    this.sesion.solicitarEnlace(email).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.email = email;
        this.enlaceDemo.set(r.enlaceDemo ?? null);
        this.paso.set("enviado");
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.mensaje.set(
          err instanceof HttpErrorResponse && err.status === 429
            ? "Demasiados intentos. Espera un minuto y vuelve a intentarlo."
            : "No pudimos enviar el enlace. Revisa tu conexión e inténtalo de nuevo.",
        );
      },
    });
  }

  protected volver() {
    this.mensaje.set("");
    this.enlaceDemo.set(null);
    this.paso.set("correo");
  }

  private verificar(token: string) {
    this.paso.set("verificando");
    this.sesion.verificar(token).subscribe({
      next: () => {
        this.me.reiniciar();
        this.me.load();
        void this.router.navigateByUrl("/dashboard", { replaceUrl: true });
      },
      error: (err: unknown) => {
        const msg = err instanceof HttpErrorResponse && typeof err.error?.message === "string" ? err.error.message : "";
        this.fallar(msg || "El enlace no es válido, ya fue usado o venció. Solicite uno nuevo.");
      },
    });
  }

  private fallar(msg: string) {
    this.mensaje.set(msg);
    this.paso.set("error");
  }
}
