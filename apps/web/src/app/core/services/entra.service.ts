import { Injectable } from "@angular/core";
import type { AuthenticationResult, IPublicClientApplication } from "@azure/msal-browser";
import { environment } from "../../../environments/environment";

const CLAVE_ENTRA = "entra_token";

// Token de Entra ID guardado tras el ingreso con Microsoft (con su vencimiento). Vencido, se
// descarta y el interceptor lleva al login.
export function tokenEntra(): string | null {
  try {
    const raw = localStorage.getItem(CLAVE_ENTRA);
    if (!raw) return null;
    const t = JSON.parse(raw) as { token: string; expiraEn: string };
    if (!t.token || new Date(t.expiraEn).getTime() <= Date.now()) {
      localStorage.removeItem(CLAVE_ENTRA);
      return null;
    }
    return t.token;
  } catch {
    return null;
  }
}

// Ingreso con Microsoft (Entra ID, MSAL). Solo se ofrece si el ambiente define entra.clientId.
// El token que se envía a la API es el de acceso para entra.scopes (el ámbito de la API), cuya
// audiencia valida el backend (ENTRA_AUDIENCE).
@Injectable({ providedIn: "root" })
export class EntraService {
  private pca: Promise<IPublicClientApplication> | null = null;

  get configurado(): boolean {
    return !!environment.entra.clientId;
  }

  private cliente(): Promise<IPublicClientApplication> {
    this.pca ??= import("@azure/msal-browser").then((m) =>
      m.PublicClientApplication.createPublicClientApplication({
        auth: { clientId: environment.entra.clientId, authority: environment.entra.authority, redirectUri: window.location.origin },
        cache: { cacheLocation: "sessionStorage" },
      }),
    );
    return this.pca!;
  }

  // Abre la ventana de Microsoft y guarda el token de la API. Devuelve false si el usuario cerró la ventana.
  async ingresar(): Promise<boolean> {
    const pca = await this.cliente();
    const scopes = environment.entra.scopes;
    let r: AuthenticationResult;
    try {
      const login = await pca.loginPopup({ scopes, prompt: "select_account" });
      r = await pca.acquireTokenSilent({ scopes, account: login.account });
    } catch (e) {
      if ((e as { errorCode?: string }).errorCode === "user_cancelled") return false;
      throw e;
    }
    const expiraEn = (r.expiresOn ?? new Date(Date.now() + 3_600_000)).toISOString();
    localStorage.setItem(CLAVE_ENTRA, JSON.stringify({ token: r.accessToken, expiraEn }));
    return true;
  }

  // Borra la sesión de Microsoft guardada en este navegador (no cierra la cuenta en Microsoft).
  async cerrar(): Promise<void> {
    try {
      localStorage.removeItem(CLAVE_ENTRA);
      if (this.pca) await (await this.pca).clearCache();
    } catch {
      // Nada que limpiar.
    }
  }
}
