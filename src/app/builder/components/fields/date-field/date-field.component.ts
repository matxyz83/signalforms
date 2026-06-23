import { Component, computed, input, signal, Signal } from '@angular/core';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { FormFieldModule } from '@progress/kendo-angular-inputs';
import { TranslocoPipe } from '@jsverse/transloco';
import { DateTime } from 'luxon';
import { FieldTree } from '@angular/forms/signals';
import { FieldType, FormFieldConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

/** Formato Luxon di default per la serializzazione stringa, per tipo campo. */
const DEFAULT_FORMAT: Partial<Record<FieldType, string>> = {
  // [FieldType.Date]:     'yyyy-MM-dd',
  // [FieldType.DateTime]: "yyyy-MM-dd'T'HH:mm:ss",
  [FieldType.Time]:     'HH:mm:ss',
};

@Component({
  selector: 'app-date-field',
  standalone: true,
  imports: [DateInputsModule, LabelModule, FormFieldModule, TranslocoPipe],
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.scss',
})
export class DateFieldComponent {
  readonly config      = input.required<FormFieldConfig>();
  readonly control     = input.required<FieldTree<unknown>>();
  readonly state      = computed(() => this.control()());

  readonly dateValue = computed(() => {
    const v = this.state().value();
    if (v instanceof Date) return v;
    if (typeof v === 'string' && v) return this.parseString(v);
    return null;
  });

  readonly disabledSig = input<Signal<boolean>>(signal(false));
  /** Formato di visualizzazione nel picker — usa `config().format` se presente, altrimenti il default per tipo. */
  readonly displayFormat = computed(() => {
    if (this.config().format) return this.config().format!;
    switch (this.config().type) {
      case FieldType.DateTime: return 'dd/MM/yyyy HH:mm';
      case FieldType.Time:     return 'HH:mm';
      default:                 return 'dd/MM/yyyy';
    }
  });

  readonly serverError = input<string | null>(null);

  readonly errorInfo = computed(() => {
    const se = this.serverError();
    return se ? { key: se } : firstErrorInfo(this.state().errors());
  });

  readonly FieldType = FieldType;
  readonly isDisabled = computed(() => this.disabledSig()());
  readonly showError = computed(() => (this.state().touched() && this.state().invalid()) || !!this.serverError());

  onValueChange(value: Date | null): void {
    const s = this.state();
    const current = s.value();
    // Se il valore corrente è una stringa, scrivi indietro come stringa (stessa forma del modello).
    if (value != null && typeof current === 'string') {
      s.value.set(this.formatDate(value));
    } else {
      s.value.set(value ?? null);
    }
    s.markAsDirty();
  }

  private formatDate(d: Date): string {
    const fmt = DEFAULT_FORMAT[this.config().type] ?? "yyyy-MM-dd'T'HH:mm:ss";
    return DateTime.fromJSDate(d).toFormat(fmt);
  }

  private parseString(raw: string): Date | null {
    const fmt = DEFAULT_FORMAT[this.config().type];
    const dt = fmt ? DateTime.fromFormat(raw, fmt) : DateTime.fromISO(raw);
    return dt.isValid ? dt.toJSDate() : null;
  }
}
