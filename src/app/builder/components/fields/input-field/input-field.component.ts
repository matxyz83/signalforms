import { Component, computed, input, signal, Signal } from '@angular/core';
import { InputsModule, FormFieldModule, InputType } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldTree } from '@angular/forms/signals';
import { FormFieldConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

@Component({
  selector: 'app-input-field',
  standalone: true,
  imports: [InputsModule, FormFieldModule, LabelModule, TranslocoPipe],
  templateUrl: './input-field.component.html',
  styleUrl: './input-field.component.scss',
})
export class InputFieldComponent {
  readonly config      = input.required<FormFieldConfig>();
  readonly control     = input.required<FieldTree<unknown>>();
  readonly disabledSig = input<Signal<boolean>>(signal(false));

  readonly serverError = input<string | null>(null);
  readonly state      = computed(() => this.control()());

  readonly errorInfo = computed(() => {
    const se = this.serverError();
    return se ? { key: se } : firstErrorInfo(this.state().errors());
  });

  readonly inputType   = computed<InputType>(() => (this.config().inputType as InputType ?? "text"));
  readonly isDisabled = computed(() => this.disabledSig()());
  readonly isNumeric = computed(() => this.config().inputType === 'number');

  readonly numericValue = computed(() => {
    const v = this.state().value();
    return typeof v === 'number' ? v : 0;
  });
  readonly showError = computed(() => (this.state().touched() && this.state().invalid()) || !!this.serverError());
  readonly stringValue = computed(() => String(this.state().value() ?? ''));

  onValueChange(value: unknown): void {
    const s = this.state();
    s.value.set(value ?? null);
    s.markAsDirty();
  }
}
