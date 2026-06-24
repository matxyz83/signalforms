import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { GridModule, DataStateChangeEvent, SelectionEvent, SelectableSettings, PagerSettings, RowArgs } from '@progress/kendo-angular-grid';
import { FilterDescriptor, State } from '@progress/kendo-data-query';
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { TranslocoPipe } from '@jsverse/transloco';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, isObservable, Observable, of } from 'rxjs';
import { map as rxMap, startWith, switchMap } from 'rxjs/operators';
import { FieldOption, GridColumnConfig, GridOptionsLoader } from '../../models/form-field-config';
import { pencilIcon, plusIcon, SVGIcon, trashIcon } from '@progress/kendo-svg-icons';

const DEFAULT_STATE: State = { skip: 0, take: 10, filter: { filters: [], logic: 'and' } };

/** Versione tipizzata di GridDataResult — il campo data preserva il tipo T. */
export type TypedGridResult<T> = { data: T[]; total: number };

@Component({
  selector: 'app-grid-renderer',
  standalone: true,
  imports: [GridModule, DialogModule, ButtonsModule, DropDownsModule, InputsModule, DateInputsModule, TranslocoPipe],
  templateUrl: './grid-renderer.component.html',
  styleUrl: './grid-renderer.component.scss',
})
export class GridRendererComponent<T extends Record<string, unknown>> {
  // Filtri manuali per colonne FieldOption[] (es. interessi), non gestibili via Kendo Data Query
  private readonly _arrayFilters = signal(new Map<string, unknown>());
  // Filtri time: confronto solo sulla parte oraria (hh/mm/ss) per evitare dipendenza dalla data del giorno
  private readonly _timeFilters = signal(new Map<string, { value: Date; operator: string }>());
  readonly columns = input.required<GridColumnConfig[]>();
  // Risoluzione reattiva delle opzioni filtro per le colonne combobox (statiche, Observable, factory)
  private readonly resolvedFilterOptions = toSignal(
    toObservable(this.columns).pipe(
      switchMap(cols => {
        const comboCols = cols.filter(c => c.filter === 'combobox');
        if (!comboCols.length) return of(new Map<string, FieldOption[]>());
        return combineLatest(
          comboCols.map(col => {
            const opts = col.filterOptions as GridOptionsLoader | undefined;
            let obs$: Observable<FieldOption[]>;
            if (!opts || Array.isArray(opts)) {
              obs$ = of((opts as FieldOption[]) ?? []);
            } else if (isObservable(opts)) {
              obs$ = opts as Observable<FieldOption[]>;
            } else {
              obs$ = (opts as () => Observable<FieldOption[]>)();
            }
            return obs$.pipe(
              startWith([] as FieldOption[]),
              rxMap(data => [col.field, data] as const),
            );
          }),
        ).pipe(rxMap(entries => new Map<string, FieldOption[]>(entries)));
      }),
    ),
    { initialValue: new Map<string, FieldOption[]>() },
  );
  /**
   * Selezione controllata dall'esterno.
   * Array di valori chiave (es. ID) oppure di oggetti — abbinare a `selectionKey`.
   * Quando cambia, la griglia rispecchia visivamente lo stato.
   */
  readonly selection    = input<unknown[]>([]);
  /**
   * Chiavi selezionate per Kendo [selectedKeys].
   * Si resetta a selection() quando il parent cambia l'input;
   * le scritture locali (click checkbox/riga) sovrascrivono fino al prossimo cambio di selection.
   */
  readonly _selectedKeys = linkedSignal<unknown[]>(() => this.selection());
  readonly createClick      = output<void>();

  readonly data    = input.required<TypedGridResult<T>>();
  readonly deleteClick      = output<T>();
  readonly editable  = input<boolean>(false);
  readonly editClick        = output<T>();
  // Applica i filtri array e time sulla data già processata dal parent
  readonly gridData = computed<TypedGridResult<T>>(() => {
    const d = this.data();
    const hasArrayFilters = this._arrayFilters().size > 0;
    const hasTimeFilters  = this._timeFilters().size > 0;
    if (!hasArrayFilters && !hasTimeFilters) return d;
    const filtered = d.data.filter(item => {
      for (const [field, value] of this._arrayFilters()) {
        if (value == null) continue;
        const arr = item[field];
        if (!Array.isArray(arr) || !(arr as FieldOption[]).some(o => o.value === value)) return false;
      }
      for (const [field, { value, operator }] of this._timeFilters()) {
        const cell = item[field];
        if (cell == null || (typeof cell !== 'string' && !(cell instanceof Date))) return false;
        if (!this.compareTime(cell as Date | string, value, operator)) return false;
      }
      return true;
    });
    return { data: filtered, total: filtered.length };
  });

  iconAdd: SVGIcon = plusIcon;
  iconDelete: SVGIcon = trashIcon;
  iconEdit: SVGIcon = pencilIcon;

  /**
   * Campo (o funzione) da usare come chiave di confronto per la selezione.
   * Es. `'id'` → confronta `item.id` con i valori di `selection`.
   * Se omesso, usa l'identità dell'oggetto (comportamento default).
   */
  readonly selectionKey = input<string | ((item: T) => unknown) | undefined>(undefined);

  /**
   * Estrattore chiave per Kendo [kendoGridSelectBy].
   * Kendo vuole `(ctx: RowArgs) => any` (non `(item: T) => any`), quindi
   * le funzioni utente vengono wrappate per estrarre `ctx.dataItem`.
   */
  readonly kendoSelectBy = computed<string | ((ctx: RowArgs) => unknown)>(() => {
    const k = this.selectionKey();
    if (k === undefined) return (ctx: RowArgs) => ctx.dataItem;
    if (typeof k === 'string') return k;
    return (ctx: RowArgs) => k(ctx.dataItem as T);
  });

  readonly pageable   = input<boolean | PagerSettings>({ pageSizes: [5, 10, 20] })

  readonly pendingDelete = signal<T | null>(null);

  readonly selectableSettings = computed<SelectableSettings | boolean>(() =>
    this.editable()
      ? { enabled: true, mode: 'single' }
      : { enabled: true, mode: 'multiple', checkboxOnly: true },
  );

  readonly selectionChange  = output<T[]>();

  readonly state   = input<State>(DEFAULT_STATE);

  readonly stateChange      = output<State>();

  applyComboFilter(value: unknown, col: GridColumnConfig): void {
    if (col.filterOperator === 'contains') {
      // FieldOption[] — filtro interno al componente su .value di ogni elemento dell'array
      this._arrayFilters.update(m => {
        const next = new Map(m);
        if(value != null)
          next.set(col.field, value)
        else
          next.delete(col.field);
        return next;
      });
    } else {
      // Usa sempre dot notation — il remap verso filterField avviene in onStateChange
      const dotKey = `${col.field}.value`;
      const current = this.state();
      // Legge usando filterField (stato già remappato) per rimuovere correttamente il filtro precedente
      const storedKey = col.filterField ?? dotKey;
      const others = ((current.filter?.filters ?? []) as FilterDescriptor[]).filter(f => f.field !== storedKey);
      this.onStateChange({
        ...current,
        skip: 0,
        filter: {
          logic: current.filter?.logic ?? 'and',
          filters: value != null ? [...others, { field: dotKey, operator: 'eq', value }] : others,
        },
      } as DataStateChangeEvent);
    }
  }

  applyDateFilter(value: Date | null, col: GridColumnConfig): void {
    const current = this.state();
    const others = ((current.filter?.filters ?? []) as FilterDescriptor[])
      .filter(f => f.field !== col.field);
    this.onStateChange({
      ...current,
      skip: 0,
      filter: {
        logic: current.filter?.logic ?? 'and',
        filters: value != null
          ? [...others, { field: col.field, operator: col.filterOperator ?? 'eq', value }]
          : others,
      },
    } as DataStateChangeEvent);
  }

  applyTimeFilter(value: Date | null, col: GridColumnConfig): void {
    this._timeFilters.update(m => {
      const next = new Map(m);
      if (value != null) {
        next.set(col.field, { value, operator: col.filterOperator ?? 'eq' });
      } else {
        next.delete(col.field);
      }
      return next;
    });
  }

  /**
   * Tipo filtro da passare a [filter] di kendo-grid-column.
   * Per combobox e time usiamo 'text' perché il filtro è un kendoGridFilterCellTemplate custom;
   * passare il tipo originale farebbe apparire anche l'editor built-in di Kendo.
   */
  columnFilterType(col: GridColumnConfig): string {
    if (col.filter === 'combobox' || col.filter === 'time' || col.filter === 'date') return 'text';
    if (col.display === 'boolean') return 'boolean';
    return col.filter ?? 'text';
  }

  /**
   * Normalizza il formato per [format] di kendo-grid-column.
   * Accetta sia 'HH:mm:ss' che '{0:HH:mm:ss}' — aggiunge il wrapper {0:} se assente.
   * Per le colonne time usa 'HH:mm:ss' come default.
   */
  columnFormat(col: GridColumnConfig): string {
    const raw = col.format ?? (col.filter === 'time' ? 'HH:mm:ss' : '');
    if (!raw) return '';
    return raw.startsWith('{0:') ? raw : `{0:${raw}}`;
  }

  comboFilterValue(col: GridColumnConfig): unknown {
    if (col.filterOperator === 'contains') {
      return this._arrayFilters().get(col.field) ?? null;
    }
    // Lo stato memorizzato usa già filterField se presente (remappato da onStateChange)
    const key = col.filterField ?? `${col.field}.value`;
    const filters = (this.state().filter?.filters ?? []) as FilterDescriptor[];
    return filters.find(f => f.field === key)?.value ?? null;
  }

  confirmDelete(): void {
    const item = this.pendingDelete();
    if (item) this.deleteClick.emit(item);
    this.pendingDelete.set(null);
  }

  dateFilterValue(col: GridColumnConfig): Date | null {
    const filters = (this.state().filter?.filters ?? []) as FilterDescriptor[];
    const v = filters.find(f => f.field === col.field)?.value;
    return v instanceof Date ? v : null;
  }

  getFilterOptions(col: GridColumnConfig): FieldOption[] {
    return this.resolvedFilterOptions().get(col.field) ?? [];
  }

  /** Mostra il label di un valore FieldOption o FieldOption[] */
  labelForValue(value: unknown): string {
    if (value == null) return '';
    if (Array.isArray(value)) {
      return (value as FieldOption[]).map(o => o.label ?? String(o.value)).join(', ');
    }
    const opt = value as FieldOption;
    return String(opt.label ?? opt.value ?? '');
  }

  onSelectionChange(event: SelectionEvent): void {
    const addedKeys   = (event.selectedRows   ?? []).map(r => this.keyOf(r.dataItem as T));
    const removedKeys = new Set((event.deselectedRows ?? []).map(r => this.keyOf(r.dataItem as T)));

    this._selectedKeys.update(current => {
      const next = current.filter(k => !removedKeys.has(k));
      for (const k of addedKeys) {
        if (!next.includes(k)) next.push(k);
      }
      return next;
    });

    // Emette gli oggetti della pagina corrente che corrispondono alle chiavi selezionate
    const keySet = new Set(this._selectedKeys());
    this.selectionChange.emit(
      this.gridData().data.filter(item => keySet.has(this.keyOf(item))),
    );
  }

  onStateChange(event: DataStateChangeEvent): void {
    let s: State = this.remapFilterFields(event);
    if (this.pageable() === false) {
      const { skip: _skip, take: _take, ...rest } = s;
      s = rest;
    }
    this.stateChange.emit(s);
  }

  timeFilterValue(col: GridColumnConfig): Date | null {
    return this._timeFilters().get(col.field)?.value ?? null;
  }

  private compareTime(a: Date | string, b: Date, op: string): boolean {
    const aMs = this.timeToMs(a);
    const bMs = this.timeToMs(b);
    switch (op) {
      case 'eq':  return aMs === bMs;
      case 'neq': return aMs !== bMs;
      case 'gte': return aMs >= bMs;
      case 'gt':  return aMs >  bMs;
      case 'lte': return aMs <= bMs;
      case 'lt':  return aMs <  bMs;
      default:    return aMs === bMs;
    }
  }

  /** Estrae la chiave di un item secondo selectionKey (campo, funzione, o identity). */
  private keyOf(item: T): unknown {
    const k = this.selectionKey();
    if (k === undefined) return item;
    return typeof k === 'function' ? k(item) : (item as Record<string, unknown>)[k as string];
  }

  private remapFilterFields(state: State): State {
    if (!state.filter?.filters?.length) return state;
    const remap = new Map(
      this.columns()
        .filter(c => c.filterField)
        .map(c => [`${c.field}.value`, c.filterField!]),
    );
    if (!remap.size) return state;
    return {
      ...state,
      filter: {
        ...state.filter,
        filters: (state.filter.filters as FilterDescriptor[]).map(f =>
          remap.has(f.field as string) ? { ...f, field: remap.get(f.field as string)! } : f,
        ),
      },
    };
  }

  private timeToMs(v: Date | string): number {
    if (v instanceof Date) {
      return v.getHours() * 3600000 + v.getMinutes() * 60000 + v.getSeconds() * 1000;
    }
    const [h = 0, m = 0, s = 0] = (v as string).split(':').map(Number);
    return h * 3600000 + m * 60000 + s * 1000;
  }
}
