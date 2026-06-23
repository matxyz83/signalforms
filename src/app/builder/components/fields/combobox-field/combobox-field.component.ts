import { Component, computed, inject, Injector, input, runInInjectionContext, signal, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { isObservable, Observable, of, Subject } from 'rxjs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { FormFieldModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldTree } from '@angular/forms/signals';
import { FieldOption, FormFieldConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

function resolveOptions(opts: FieldOption[] | Observable<FieldOption[]> | undefined): Observable<FieldOption[]> {
  if (!opts) return of([]);
  return isObservable(opts) ? opts : of(opts);
}

@Component({
  selector: 'app-combobox-field',
  standalone: true,
  imports: [DropDownsModule, FormFieldModule, LabelModule, TranslocoPipe],
  templateUrl: './combobox-field.component.html',
  styleUrl: './combobox-field.component.scss',
})
export class ComboboxFieldComponent {
  readonly control     = input.required<FieldTree<unknown>>();
  readonly state      = computed(() => this.control()());
  readonly arrayValue = computed<FieldOption[]>(() => {
    const v = this.state().value();
    return Array.isArray(v) ? (v as FieldOption[]) : [];
  });
  readonly config      = input.required<FormFieldConfig>();

  readonly disabledSig = input<Signal<boolean>>(signal(false));

  private readonly _openCount    = signal(0);
  private readonly injector = inject(Injector);
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
    return isObservable(opts) ? opts : of([]);
  });
  private readonly asyncBaseOptions = toSignal(
    toObservable(this.resolvedOptionsObs).pipe(switchMap(obs => obs)),
    { initialValue: [] as FieldOption[] },
  );
  private readonly baseOptions = computed<FieldOption[]>(() => {
    const opts = this.config().options;
    if (!opts) return [];
    if (Array.isArray(opts)) return opts;
    return this.asyncBaseOptions();
  });

  private readonly filterTerm    = signal('');

  private readonly searchResults = signal<FieldOption[]>([]);

  readonly displayData = computed<FieldOption[]>(() => {
    this._openCount();
    const cfg  = this.config();
    const term = this.filterTerm().toLowerCase();
    const base = this.baseOptions();

    if (cfg.searchFn) {
      if (!term) {
        const current = this.state().value() as FieldOption | null;
        if (current && !base.some(o => o.value === current.value)) {
          return [current, ...base];
        }
        return base;
      }
      const serverResults = this.searchResults();
      if (serverResults.length > 0) return serverResults;
      return base.filter(o => String(o.label).toLowerCase().includes(term));
    }

    return term
      ? base.filter(o => String(o.label).toLowerCase().includes(term))
      : base;
  });

  readonly serverError = input<string | null>(null);

  readonly errorInfo = computed(() => {
    const se = this.serverError();
    return se ? { key: se } : firstErrorInfo(this.state().errors());
  });

  readonly isDisabled = computed(() => this.disabledSig()());

  readonly loading    = signal(false);
  readonly showError = computed(() => (this.state().touched() && this.state().invalid()) || !!this.serverError());
  private readonly searchInput$  = new Subject<string>();

  constructor() {
    this.searchInput$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        const fn = this.config().searchFn;
        if (!fn) return of([]);
        return fn(term).pipe(catchError(() => of([])));
      }),
      takeUntilDestroyed(),
    ).subscribe(results => {
      this.searchResults.set(results);
      this.loading.set(false);
    });
  }

  onFilterChange(term: string): void {
    this.filterTerm.set(term);
    if (this.config().searchFn) {
      if (term) {
        this.loading.set(true);
        this.searchInput$.next(term);
      } else {
        this.searchResults.set([]);
        this.loading.set(false);
      }
    }
  }

  onMultiValueChange(value: unknown): void {
    const s = this.state();
    s.value.set((value as FieldOption[]) ?? []);
    s.markAsDirty();
  }

  onOpen(): void {
    this._openCount.update(n => n + 1);
    this.filterTerm.set('');
    this.searchResults.set([]);
    this.loading.set(false);
  }

  onValueChange(value: unknown): void {
    const opt = (value as FieldOption | null | undefined) ?? null;
    const s = this.state();
    s.value.set(opt);
    s.markAsDirty();
    this.filterTerm.set('');
    this.searchResults.set([]);
    this.loading.set(false);
  }
}
