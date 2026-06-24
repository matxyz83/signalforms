import { Component, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { DialogCloseResult, DialogModule, DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-form-dialog-shell',
  standalone: true,
  imports: [DialogModule, ButtonsModule, TranslocoPipe],
  template: `
    <div #bodySlot class="dialog-body"></div>
    <kendo-dialog-actions layout="end">
      <button kendoButton type="button" (click)="onCancel()">{{ 'form.cancel' | transloco }}</button>
      <button kendoButton themeColor="primary" type="submit" [attr.form]="formId()">
        {{ submitLabel() }}
      </button>
    </kendo-dialog-actions>
  `,
  styles: [`
    .dialog-body {
      padding: 8px 0 4px;
      max-height: 70vh;
      overflow-y: auto;
      overflow-x: hidden;
    }
  `],
})
class FormDialogShellComponent {
  private readonly dialogRef = inject(DialogRef);

  readonly bodySlot    = viewChild.required<ElementRef<HTMLElement>>('bodySlot');
  readonly formId      = input<string>('form-dialog');
  readonly submitLabel = input<string>('Salva');

  onCancel(): void {
    this.dialogRef.close({ type: 'cancel' });
  }
}

// Wrapper basato su DOM teleportation:
// il contenuto proiettato viene tenuto in un wrapper nascosto e spostato
// nel bodySlot dello shell dialog all'apertura, poi ripristinato alla chiusura.
// I binding Angular sopravvivono allo spostamento DOM (le sottoscrizioni output
// sono a livello framework, non DOM).
@Component({
  selector: 'app-form-dialog',
  standalone: true,
  template: `<div #contentWrapper style="display:none"><ng-content /></div>`,
})
export class FormDialogComponent {
  private readonly dialogService = inject(DialogService);

  private readonly contentWrapper = viewChild.required<ElementRef<HTMLElement>>('contentWrapper');

  private closingProgrammatically = false;
  private dialogRef: DialogRef | null = null;
  private originalNextSibling: Node | null = null;
  private originalParent: Element | null = null;

  readonly cancel      = output<void>();
  readonly formId      = input<string>('form-dialog');
  readonly open        = input<boolean>(false);
  readonly submitLabel = input<string>('Salva');
  readonly title       = input<string>('');
  readonly width       = input<number>(580);

  constructor() {
    effect(() => {
      if (this.open()) {
        if (!this.dialogRef) {
          this.openDialog();
        }
      } else {
        if (this.dialogRef) {
          this.closingProgrammatically = true;
          this.dialogRef.close();
          this.dialogRef = null;
        }
      }
    });
  }

  private openDialog(): void {
    const wrapper = this.contentWrapper().nativeElement;

    this.dialogRef = this.dialogService.open({
      title: this.title(),
      content: FormDialogShellComponent,
      width: this.width(),
      minWidth: 320,
    });

    const frameRef = this.dialogRef.content;
    frameRef.setInput('formId', this.formId());
    frameRef.setInput('submitLabel', this.submitLabel());

    const shell = frameRef.instance as FormDialogShellComponent;

    // Sposta il wrapper nel bodySlot dopo che lo shell ha completato il rendering.
    // setTimeout(0) garantisce che viewChild('bodySlot') sia risolto (ngAfterViewInit).
    setTimeout(() => {
      const bodySlot = shell.bodySlot().nativeElement;
      this.originalParent = wrapper.parentElement;
      this.originalNextSibling = wrapper.nextSibling;
      bodySlot.appendChild(wrapper);
      wrapper.style.display = '';
    }, 0);

    this.dialogRef.result.subscribe(result => {
      wrapper.style.display = 'none';
      if (this.originalParent) {
        if (this.originalNextSibling) {
          this.originalParent.insertBefore(wrapper, this.originalNextSibling);
        } else {
          this.originalParent.appendChild(wrapper);
        }
      }
      this.originalParent = null;
      this.originalNextSibling = null;

      if (!this.closingProgrammatically) {
        if (result instanceof DialogCloseResult) {
          this.cancel.emit();
        } else if (result && typeof result === 'object') {
          const r = (result as unknown) as { type: string };
          if (r.type === 'cancel') {
            this.cancel.emit();
          }
        }
      }
      this.closingProgrammatically = false;
      this.dialogRef = null;
    });
  }
}
