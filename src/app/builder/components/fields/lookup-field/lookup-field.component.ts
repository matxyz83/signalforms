import { Component, computed, inject, input, signal, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { GridModule } from '@progress/kendo-angular-grid';
import { DialogCloseResult, DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LabelModule } from '@progress/kendo-angular-label';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { searchIcon, xIcon, SVGIcon } from '@progress/kendo-svg-icons';
import { FieldTree } from '@angular/forms/signals';
import { FieldOption, FormFieldConfig, LookupConfig } from '../../../models/form-field-config';
import { firstErrorInfo } from '../../../utils/field-error';

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
    @if (!loading() && results().length === 0 && searchTerm().length >= (lookupConfig.minSearchLength ?? 1)) {
      <p class="ld-empty">{{ 'lookup.noResults' | transloco }}</p>
    }
    <div class="ld-footer">
      <button kendoButton type="button" (click)="cancel()">{{ 'form.cancel' | transloco }}</button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ld-search { padding: 12px; border-bottom: 1px solid var(--kendo-color-border, #e0e0e0); }
    .ld-grid  { max-height: 340px; }
    .ld-empty { text-align: center; color: #888; padding: 16px; margin: 0; font-size: 13px; }
    .ld-footer {
      display: flex; justify-content: flex-end;
      padding: 8px 12px; border-top: 1px solid var(--kendo-color-border, #e0e0e0);
    }
  `],
})
export class LookupDialogComponent {
  /** Impostato dal parent subito dopo dialogService.open() */
  lookupConfig!: LookupConfig;

  private readonly dialogRef  = inject(DialogRef);

  readonly searchTerm = signal('');
  readonly results    = signal<Record<string, unknown>[]>([]);
  readonly loading    = signal(false);

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

  select(row: Record<string, unknown>): void {
    const option: FieldOption = {
      value: row[this.lookupConfig.valueField],
      label: String(row[this.lookupConfig.labelField] ?? ''),
    };
    this.dialogRef.close(option);
  }

  cancel(): void {
    this.dialogRef.close(null);
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
  readonly control     = input.required<FieldTree<unknown>>();
  readonly config      = input.required<FormFieldConfig>();
  readonly disabledSig = input<Signal<boolean>>(signal(false));

  readonly state      = computed(() => this.control()());
  readonly isDisabled = computed(() => this.disabledSig()());

  readonly displayValue = computed(() => {
    const v = this.state().value() as FieldOption | null;
    return v?.label ?? '';
  });

  readonly showError = computed(() => this.state().touched() && this.state().invalid());
  readonly errorInfo = computed(() => firstErrorInfo(this.state().errors()));

  readonly searchIcon: SVGIcon = searchIcon;
  readonly clearIcon:  SVGIcon = xIcon;

  private readonly dialogService = inject(DialogService);
  private readonly transloco     = inject(TranslocoService);

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
      const s = this.state();
      s.value.set(result as unknown as FieldOption);
      s.markAsDirty();
      s.markAsTouched();
    });
  }

  clear(): void {
    const s = this.state();
    s.value.set(null);
    s.markAsDirty();
    s.markAsTouched();
  }
}
