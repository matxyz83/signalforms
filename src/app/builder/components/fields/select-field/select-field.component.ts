import { Component, computed, inject, Injector, input, runInInjectionContext, signal, Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { isObservable, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { FormFieldModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FieldTree } from '@angular/forms/signals';
import { FieldOption, FormFieldConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

function resolveOptions(opts: FieldOption[] | Observable<FieldOption[]> | undefined): Observable<FieldOption[]> {
  if (!opts) return of([]);
  return isObservable(opts) ? opts : of(opts);
}

@Component({
  selector: 'app-select-field',
  standalone: true,
  imports: [DropDownsModule, FormFieldModule, LabelModule, TranslocoPipe],
  templateUrl: './select-field.component.html',
  styleUrl: './select-field.component.scss',
})
export class SelectFieldComponent {
  readonly control     = input.required<FieldTree<unknown>>();
  readonly state      = computed(() => this.control()());
  readonly arrayValue = computed<FieldOption[]>(() => {
    const v = this.state().value();
    return Array.isArray(v) ? (v as FieldOption[]) : [];
  });
  readonly config      = input.required<FormFieldConfig>();

  private readonly transloco = inject(TranslocoService);
  // TranslocoService necessario qui: defaultItem.label è una stringa dentro un oggetto Kendo,
  // non può essere tradotta con la pipe nel template.
  readonly defaultItem = computed(() => ({
    label: this.transloco.translate(this.config().placeholder ?? 'select.choose'),
    value: null,
  }));

  readonly disabledSig = input<Signal<boolean>>(signal(false));
  private readonly injector  = inject(Injector);

  readonly formValues  = input<Signal<Record<string, unknown>> | undefined>(undefined);

  private readonly stateValues = computed<Record<string, unknown>>(() => {
    const sig = this.formValues();
    return sig ? sig() : {};
  });

  private readonly resolvedOptionsObs = computed<Observable<FieldOption[]>>(() => {
    const cfg = this.config();
    const opts = cfg.options;
    if (typeof opts === 'function') {
      const values = this.stateValues();
      return runInInjectionContext(this.injector, () => resolveOptions(opts(values)));
    }
    return resolveOptions(opts);
  });

  readonly displayOptions = toSignal(
    toObservable(this.resolvedOptionsObs).pipe(switchMap(obs => obs)),
    { initialValue: [] as FieldOption[] },
  );

  readonly serverError = input<string | null>(null);

  readonly errorInfo = computed(() => {
    const se = this.serverError();
    return se ? { key: se } : firstErrorInfo(this.state().errors());
  });
  readonly isDisabled = computed(() => this.disabledSig()());
  readonly showError = computed(() => (this.state().touched() && this.state().invalid()) || !!this.serverError());

  onValueChange(value: unknown): void {
    const s = this.state();
    const opt = value as FieldOption | null | undefined;
    s.value.set(opt == null || opt.value == null ? null : opt);
    s.markAsDirty();
  }
}
