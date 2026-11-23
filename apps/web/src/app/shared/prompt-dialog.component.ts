import { Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { DynamicDialogRef, DynamicDialogConfig } from "primeng/dynamicdialog";

export interface PromptDialogData {
  label?: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  required?: boolean;
}

@Component({
  selector: "lm-prompt-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule],
  template: `
    <div class="lm-col" style="gap:12px; min-width:380px;">
      <label *ngIf="data.label">{{ data.label }}</label>
      <textarea
        *ngIf="data.multiline"
        pTextarea
        rows="4"
        [(ngModel)]="value"
        [placeholder]="data.placeholder ?? ''"
        (keydown.meta.enter)="confirmar()"
        (keydown.control.enter)="confirmar()"
      ></textarea>
      <input
        *ngIf="!data.multiline"
        pInputText
        type="text"
        [(ngModel)]="value"
        [placeholder]="data.placeholder ?? ''"
        (keyup.enter)="confirmar()"
      />
      <div class="lm-row" style="justify-content:flex-end; gap:8px;">
        <button pButton type="button" label="Cancelar" [text]="true" severity="secondary" (click)="cancelar()"></button>
        <button pButton type="button" label="Aceptar" (click)="confirmar()" [disabled]="data.required && !value.trim()"></button>
      </div>
    </div>
  `,
})
export class PromptDialogComponent implements OnInit {
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig<PromptDialogData>);

  protected data: PromptDialogData = {};
  protected value = "";

  ngOnInit() {
    this.data = this.config.data ?? {};
    this.value = this.data.initialValue ?? "";
  }

  confirmar() {
    if (this.data.required && !this.value.trim()) return;
    this.ref.close(this.value);
  }

  cancelar() {
    this.ref.close(null);
  }
}
