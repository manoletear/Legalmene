import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../../../environments/environment";

export interface CurrentUser {
  id?: string;
  email: string;
  nombre: string;
  rol: string;
  codPlanes: string[];
}

@Injectable({ providedIn: "root" })
export class MeService {
  private http = inject(HttpClient);
  private _user = signal<CurrentUser | null>(null);
  readonly user = this._user.asReadonly();

  load(): void {
    this.http.get<CurrentUser>(`${environment.apiBaseUrl}/me`).subscribe({
      next: (u) => this._user.set(u),
      error: () => this._user.set(null),
    });
  }
}
