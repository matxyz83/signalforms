import { Component, computed, input, signal, Signal } from '@angular/core';
import { InputsModule, FormFieldModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldTree } from '@angular/forms/signals';
import { FormFieldConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

@Component({
  selector: 'app-checkbox-field',
  standalone: true,
  imports: [InputsModule, FormFieldModule, LabelModule, TranslocoPipe],
  templateUrl: './checkbox-field.component.html',
  styleUrl: './checkbox-field.component.scss',
})
export class CheckboxFieldComponent {
  readonly control     = input.required<FieldTree<unknown>>();
  readonly config      = input.required<FormFieldConfig>();
  readonly disabledSig = input<Signal<boolean>>(signal(false));

  readonly state      = computed(() => this.control()());
  readonly isDisabled = computed(() => this.disabledSig()());

  readonly boolValue = computed(() => Boolean(this.state().value()));
  readonly showError = computed(() => this.state().touched() && this.state().invalid());
  readonly errorInfo = computed(() => firstErrorInfo(this.state().errors()));

  onChange(event: Event): void {
    const s = this.state();
    s.value.set((event.target as HTMLInputElement).checked);
    s.markAsDirty();
  }
}
