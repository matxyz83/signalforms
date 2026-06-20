import { Component, computed, inject, signal } from '@angular/core';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { process, State } from '@progress/kendo-data-query';
import { FieldOption, FieldType, FormFieldConfig, GridColumnConfig, ValidatorType } from '../../builder/models/form-field-config';
import { FormEngineService } from '../../builder/services/form-engine.service';
import { FormRendererComponent } from '../../builder/components/form-renderer/form-renderer.component';
import { FormDialogComponent } from '../../builder/components/form-dialog/form-dialog.component';
import { GridRendererComponent, TypedGridResult } from '../../builder/components/grid-renderer/grid-renderer.component';

// Omit<..., never> forza il tipo attraverso il mapped-type di TypeScript,
// che soddisfa il vincolo T extends Record<string, unknown> di GridRendererComponent.
type OrdineForm = Omit<{
  id: number | null;
  prodotto: FieldOption | null;
  quantita: number | null;
  note: string;
}, never>;

const EMPTY: OrdineForm = { id: null, prodotto: null, quantita: null, note: '' };

const SAMPLE_ORDERS: OrdineForm[] = [
  { id: 1, prodotto: { value: 'P001', label: 'Laptop Pro 15"' },  quantita: 2, note: 'Consegna urgente' },
  { id: 2, prodotto: { value: 'P004', label: 'Monitor 27"' },     quantita: 5, note: '' },
  { id: 3, prodotto: { value: 'P002', label: 'Mouse Wireless' },  quantita: 10, note: 'Scorta magazzino' },
];

/** Catalogo prodotti fittizio — simula una risposta API. */
const CATALOG: Record<string, unknown>[] = [
  { id: 'P001', nome: 'Laptop Pro 15"',     categoria: 'Elettronica', prezzo: 1299 },
  { id: 'P002', nome: 'Mouse Wireless',      categoria: 'Accessori',   prezzo: 29   },
  { id: 'P003', nome: 'Tastiera Meccanica',  categoria: 'Accessori',   prezzo: 89   },
  { id: 'P004', nome: 'Monitor 27"',         categoria: 'Monitor',     prezzo: 399  },
  { id: 'P005', nome: 'Webcam HD',           categoria: 'Accessori',   prezzo: 59   },
  { id: 'P006', nome: 'SSD 1TB',             categoria: 'Storage',     prezzo: 119  },
  { id: 'P007', nome: 'RAM 32GB DDR5',       categoria: 'Componenti',  prezzo: 149  },
  { id: 'P008', nome: 'Laptop Ultra 13"',    categoria: 'Elettronica', prezzo: 999  },
  { id: 'P009', nome: 'Dock USB-C 10 porte', categoria: 'Accessori',  prezzo: 79   },
  { id: 'P010', nome: 'Stampante Laser',     categoria: 'Stampa',      prezzo: 249  },
];

function searchCatalog(term: string) {
  const q = term.toLowerCase();
  return of(
    CATALOG.filter(p =>
      String(p['nome']).toLowerCase().includes(q) ||
      String(p['categoria']).toLowerCase().includes(q) ||
      String(p['id']).toLowerCase().includes(q),
    ),
  ).pipe(delay(400));  // simula latenza API
}

@Component({
  selector: 'app-lookup-example',
  standalone: true,
  imports: [GridRendererComponent, FormDialogComponent, FormRendererComponent],
  templateUrl: './lookup-example.component.html',
  styleUrl: './lookup-example.component.scss',
})
export class LookupExampleComponent {
  private readonly engine = inject(FormEngineService);

  readonly orders    = signal<OrdineForm[]>(SAMPLE_ORDERS);
  readonly gridState = signal<State>({ filter: { filters: [], logic: 'and' } });

  readonly gridData = computed<TypedGridResult<OrdineForm>>(() =>
    process(
      this.orders() as unknown as Record<string, unknown>[],
      this.gridState(),
    ) as TypedGridResult<OrdineForm>,
  );

  readonly gridColumns: GridColumnConfig[] = [
    { field: 'prodotto', title: 'columns.prodotto', display: 'option' },
    { field: 'quantita', title: 'columns.quantita', width: 80, filter: 'numeric' },
    { field: 'note',     title: 'fields.note.label', filter: 'text' },
  ];

  readonly showForm  = signal(false);
  readonly isNew     = signal(false);
  readonly currentId = signal<number | null>(null);

  readonly formModel = signal<OrdineForm>(EMPTY);
  readonly formConfig: FormFieldConfig[] = this.buildFormConfig();
  readonly form = this.engine.buildForm(this.formModel, this.formConfig);

  readonly lastPayload = signal<string | null>(null);

  onGridStateChange(state: State): void { this.gridState.set(state); }

  onCreateClick(): void {
    this.formModel.set(EMPTY);
    this.isNew.set(true);
    this.currentId.set(null);
    this.showForm.set(true);
  }

  onEditClick(item: OrdineForm): void {
    this.formModel.set(item);
    this.isNew.set(false);
    this.currentId.set(item.id);
    this.showForm.set(true);
  }

  onDeleteClick(item: OrdineForm): void {
    this.orders.update(list => list.filter(o => o.id !== item.id));
    if (this.currentId() === item.id) this.showForm.set(false);
  }

  onFormSubmit(payload: Record<string, unknown>): void {
    const ordine = payload as unknown as OrdineForm;
    if (this.isNew()) {
      const nextId = Math.max(0, ...this.orders().map(o => o.id ?? 0)) + 1;
      this.orders.update(list => [...list, { ...ordine, id: nextId }]);
    } else {
      this.orders.update(list => list.map(o => o.id === ordine.id ? ordine : o));
    }
    this.lastPayload.set(JSON.stringify(ordine, null, 2));
    this.showForm.set(false);
  }

  cancelForm(): void { this.showForm.set(false); }

  private buildFormConfig(): FormFieldConfig[] {
    return [
      {
        type: FieldType.Input, field: 'id', label: 'fields.id.label',
        inputType: 'number', showInForm: false,
      },
      {
        type: FieldType.Lookup, field: 'prodotto', label: 'fields.prodotto.label',
        validators: [{ type: ValidatorType.Required }],
        lookupConfig: {
          minSearchLength: 1,
          valueField: 'id',
          labelField: 'nome',
          searchFn: searchCatalog,
          columns: [
            { field: 'id',        title: 'columns.codice',    width: 80  },
            { field: 'nome',      title: 'columns.prodotto'              },
            { field: 'categoria', title: 'columns.categoria', width: 140 },
            { field: 'prezzo',    title: 'columns.prezzo',    width: 100 },
          ],
        },
      },
      {
        type: FieldType.Input, field: 'quantita', label: 'fields.quantita.label',
        inputType: 'number',
        validators: [{ type: ValidatorType.Required }, { type: ValidatorType.Min, value: 1 }],
      },
      {
        type: FieldType.Textarea, field: 'note', label: 'fields.note.label',
        placeholder: 'fields.note.placeholder',
      },
    ];
  }
}
