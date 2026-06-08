import { Injectable, inject } from "@angular/core";
import { DialogService } from "primeng/dynamicdialog";
import { PromptDialogComponent, PromptDialogData } from "./prompt-dialog.component";

export interface PromptOptions extends PromptDialogData {
  header: string;
}

@Injectable({ providedIn: "root" })
export class PromptService {
  private dialog = inject(DialogService);

  open(opts: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const { header, ...data } = opts;
      const ref = this.dialog.open(PromptDialogComponent, {
        header,
        data,
        closable: true,
        modal: true,
        width: "min(480px, 90vw)",
      });
      ref.onClose.subscribe((v: string | null | undefined) => resolve(v ?? null));
    });
  }
}
