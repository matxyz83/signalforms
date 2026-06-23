import { Component, computed, inject, input, signal, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, filter, switchMap, take } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { GridModule } from '@progress/kendo-angular-grid';
import { DialogCloseResult, DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { plusIcon, searchIcon, xIcon, SVGIcon } from '@progress/kendo-svg-icons';
import { FieldTree } from '@angular/forms/signals';
import { FieldOption, FormFieldConfig, LookupConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

/** Sentinel emesso da LookupDialogComponent quando l'utente vuole creare un nuovo elemento. */
const LOOKUP_CREATE_KEY = '__lookup_create__';

// ── Dialog content ─────────────────────────────────────────────────────────
// Aperto tramite DialogService: viene creato a body-level, fuori dalla
// gerarchia del form dialog, evitando l'interferenza tra due kendo-dialog
// annidati che causa la chiusura indesiderata del dialog padre.

@Component({
  selector: 'app-lookup-dialog',
  standalone: true,
  imports: [GridModule, InputsModule, ButtonsModule, TranslocoPipe],
  template: `
    <div class="ld-search">
      <kendo-textbox
        [value]="searchTerm()"
        [placeholder]="(lookupConfig.searchPlaceholder ?? 'lookup.searchPlaceholder') | transloco"
        (valueChange)="onSearch($event)"
      />
      @if (lookupConfig.createFn) {
        <button kendoButton [svgIcon]="plusIcon" themeColor="primary" type="button"
                [title]="(lookupConfig.createLabel ?? 'lookup.createNew') | transloco"
                (click)="requestCreate()">
        </button>
      }
    </div>

    <kendo-grid [data]="results()" [pageable]="false" [filterable]="false" [sortable]="false"
      class="ld-grid">
      @for (col of lookupConfig.columns; track col.field) {
        <kendo-grid-column [field]="col.field" [title]="col.title | transloco" [width]="$any(col.width)" />
      }
      <kendo-grid-command-column [width]="90" [resizable]="false">
        <ng-template kendoGridCellTemplate let-dataItem>
          <button kendoButton size="small" (click)="select(dataItem)">{{ 'lookup.select' | transloco }}</button>
        </ng-template>
      </kendo-grid-command-column>
    </kendo-grid>

    <div class="ld-footer">
      <button kendoButton type="button" (click)="cancel()">{{ 'form.cancel' | transloco }}</button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ld-search {
      display: flex; gap: 8px; align-items: center;
      padding: 12px; border-bottom: 1px solid var(--kendo-color-border, #e0e0e0);
    }
    .ld-search kendo-textbox { flex: 1; }
    .ld-grid { max-height: 340px; }
    .ld-footer {
      display: flex; justify-content: flex-end;
      padding: 8px 12px; border-top: 1px solid var(--kendo-color-border, #e0e0e0);
    }
  `],
})
export class LookupDialogComponent {
  readonly loading    = signal(false);

  /** Impostato dal parent subito dopo dialogService.open() */
  lookupConfig!: LookupConfig;

  readonly plusIcon: SVGIcon = plusIcon;

  readonly results    = signal<Record<string, unknown>[]>([]);
  readonly searchTerm = signal('');
  private readonly dialogRef = inject(DialogRef);

  private readonly searchInput$ = new Subject<string>();

  constructor() {
    this.searchInput$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        const cfg = this.lookupConfig;
        if (!cfg || term.length < (cfg.minSearchLength ?? 1)) return of([]);
        return cfg.searchFn(term).pipe(catchError(() => of([])));
      }),
      takeUntilDestroyed(),
    ).subscribe(rows => {
      this.loading.set(false);
      this.results.set(rows);
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  onSearch(term: string | null): void {
    const t = term ?? '';
    this.searchTerm.set(t);
    if (t.length >= (this.lookupConfig?.minSearchLength ?? 1)) {
      this.loading.set(true);
    } else {
      this.results.set([]);
      this.loading.set(false);
    }
    this.searchInput$.next(t);
  }

  /** Chiude il dialog con un sentinel; LookupFieldComponent chiamerà createFn dopo la chiusura. */
  requestCreate(): void {
    this.dialogRef.close({ [LOOKUP_CREATE_KEY]: this.searchTerm() });
  }

  select(row: Record<string, unknown>): void {
    const option: FieldOption = {
      value: row[this.lookupConfig.valueField],
      label: String(row[this.lookupConfig.labelField] ?? ''),
    };
    this.dialogRef.close(option);
  }
}

// ── Field component ────────────────────────────────────────────────────────

@Component({
  selector: 'app-lookup-field',
  standalone: true,
  imports: [InputsModule, ButtonsModule, LabelModule, TranslocoPipe],
  templateUrl: './lookup-field.component.html',
  styleUrl: './lookup-field.component.scss',
})
export class LookupFieldComponent {
  readonly clearIcon:  SVGIcon = xIcon;
  readonly config      = input.required<FormFieldConfig>();
  readonly control     = input.required<FieldTree<unknown>>();

  readonly disabledSig = input<Signal<boolean>>(signal(false));
  readonly state      = computed(() => this.control()());

  readonly displayValue = computed(() => {
    const v = this.state().value() as FieldOption | null;
    return v?.label ?? '';
  });

  readonly serverError = input<string | null>(null);

  readonly errorInfo = computed(() => {
    const se = this.serverError();
    return se ? { key: se } : firstErrorInfo(this.state().errors());
  });
  readonly isDisabled = computed(() => this.disabledSig()());

  readonly searchIcon: SVGIcon = searchIcon;
  readonly showError = computed(() => (this.state().touched() && this.state().invalid()) || !!this.serverError());

  private readonly dialogService = inject(DialogService);
  private readonly transloco     = inject(TranslocoService);

  clear(): void {
    const s = this.state();
    s.value.set(null);
    s.markAsDirty();
    s.markAsTouched();
  }

  openDialog(): void {
    const cfg = this.config().lookupConfig;
    if (!cfg) return;

    const ref = this.dialogService.open({
      title:    this.transloco.translate(cfg.title ?? 'lookup.title'),
      content:  LookupDialogComponent,
      minWidth: 480,
      width:    680,
    });

    (ref.content.instance as LookupDialogComponent).lookupConfig = cfg;

    ref.result.subscribe(result => {
      if (result instanceof DialogCloseResult || result === null) return;

      const r = result as unknown as Record<string, unknown>;

      // Sentinel: l'utente vuole creare un nuovo elemento.
      // Il lookup dialog è già chiuso → createFn può aprire qualsiasi UI senza z-index issues.
      if (LOOKUP_CREATE_KEY in r) {
        const term = r[LOOKUP_CREATE_KEY] as string;
        cfg.createFn?.(term).pipe(
          filter((opt): opt is FieldOption => opt !== null),
          take(1),
        ).subscribe(opt => this.applyValue(opt));
        return;
      }

      this.applyValue(result as unknown as FieldOption);
    });
  }

  private applyValue(opt: FieldOption): void {
    const s = this.state();
    s.value.set(opt);
    s.markAsDirty();
    s.markAsTouched();
  }
}
