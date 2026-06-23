import { Component, computed, input, signal, Signal } from '@angular/core';
import { InputsModule, FormFieldModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldTree } from '@angular/forms/signals';
import { FormFieldConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

@Component({
  selector: 'app-textarea-field',
  standalone: true,
  imports: [InputsModule, FormFieldModule, LabelModule, TranslocoPipe],
  templateUrl: './textarea-field.component.html',
  styleUrl: './textarea-field.component.scss',
})
export class TextareaFieldComponent {
  readonly control     = input.required<FieldTree<unknown>>();
  readonly config      = input.required<FormFieldConfig>();
  readonly disabledSig = input<Signal<boolean>>(signal(false));

  readonly state      = computed(() => this.control()());
  readonly isDisabled = computed(() => this.disabledSig()());

  readonly serverError = input<string | null>(null);

  readonly showError = computed(() => (this.state().touched() && this.state().invalid()) || !!this.serverError());
  readonly errorInfo = computed(() => {
    const se = this.serverError();
    return se ? { key: se } : firstErrorInfo(this.state().errors());
  });
  readonly stringValue = computed(() => String(this.state().value() ?? ''));

  onInput(event: Event): void {
    const s = this.state();
    s.value.set((event.target as HTMLTextAreaElement).value);
    s.markAsDirty();
  }
}
