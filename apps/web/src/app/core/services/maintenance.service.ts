import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class MaintenanceService {
  private until = signal<number | null>(null);
  readonly active = signal(false);

  activate(retryAfterSec: number) {
    const ts = Date.now() + retryAfterSec * 1000;
    this.until.set(ts);
    this.active.set(true);
    // Auto-clear cuando expira el Retry-After hint.
    setTimeout(() => {
      if (this.until() === ts) {
        this.active.set(false);
        this.until.set(null);
      }
    }, retryAfterSec * 1000);
  }

  clear() {
    this.active.set(false);
    this.until.set(null);
  }
}
