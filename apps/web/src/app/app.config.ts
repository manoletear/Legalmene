import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideAnimations } from "@angular/platform-browser/animations";
import { providePrimeNG } from "primeng/config";
import { definePreset } from "@primeng/themes";
import Aura from "@primeng/themes/aura";
import { ConfirmationService, MessageService } from "primeng/api";
import { DialogService } from "primeng/dynamicdialog";
import { routes } from "./app.routes";
import { codPlanInterceptor } from "./core/interceptors/cod-plan.interceptor";
import { maintenanceInterceptor } from "./core/interceptors/maintenance.interceptor";

// Theme custom de LegalChile sobre Aura: primary blue 800/900 institucional.
// Aura palette está expuesta vía CSS variables (`--p-primary-500`, etc.)
const LegalChilePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "{blue.50}",
      100: "{blue.100}",
      200: "{blue.200}",
      300: "{blue.300}",
      400: "{blue.400}",
      500: "{blue.600}",
      600: "{blue.700}",
      700: "{blue.800}",
      800: "{blue.900}",
      900: "{blue.950}",
      950: "{blue.950}",
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([codPlanInterceptor, maintenanceInterceptor])),
    providePrimeNG({
      theme: {
        preset: LegalChilePreset,
        options: {
          darkModeSelector: ".lm-dark",
          cssLayer: {
            name: "primeng",
            order: "tailwind-base, primeng, tailwind-utilities",
          },
        },
      },
      ripple: true,
    }),
    MessageService,
    ConfirmationService,
    DialogService,
  ],
};
