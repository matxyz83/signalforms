import { Component, computed, inject, signal } from "@angular/core";
import { of, Subject } from "rxjs";
import { delay } from "rxjs/operators";
import { process, State } from "@progress/kendo-data-query";
import { ButtonsModule } from "@progress/kendo-angular-buttons";
import {
  DialogCloseResult,
  DialogRef,
  DialogService,
} from "@progress/kendo-angular-dialog";
import {
  FieldOption,
  FieldType,
  FormFieldConfig,
  GridColumnConfig,
  ValidatorType,
} from "../../builder/models/form-field-config";
import { FormEngineService } from "../../builder/services/form-engine.service";
import { FormRendererComponent } from "../../builder/components/form-renderer/form-renderer.component";
import { FormDialogComponent } from "../../builder/components/form-dialog/form-dialog.component";
import {
  GridRendererComponent,
  TypedGridResult,
} from "../../builder/components/grid-renderer/grid-renderer.component";

type OrdineForm = Omit<
  {
    id: number | null;
    prodotto: FieldOption | null;
    quantita: number | null;
    note: string;
  },
  never
>;

const EMPTY: OrdineForm = {
  id: null,
  prodotto: null,
  quantita: null,
  note: "",
};

const SAMPLE_ORDERS: OrdineForm[] = [
  {
    id: 1,
    prodotto: { value: "P001", label: 'Laptop Pro 15"' },
    quantita: 2,
    note: "Consegna urgente",
  },
  {
    id: 2,
    prodotto: { value: "P004", label: 'Monitor 27"' },
    quantita: 5,
    note: "",
  },
  {
    id: 3,
    prodotto: { value: "P002", label: "Mouse Wireless" },
    quantita: 10,
    note: "Scorta magazzino",
  },
];

const CATALOG: Record<string, unknown>[] = [
  {
    id: "P001",
    nome: 'Laptop Pro 15"',
    categoria: "Elettronica",
    prezzo: 1299,
  },
  { id: "P002", nome: "Mouse Wireless", categoria: "Accessori", prezzo: 29 },
  {
    id: "P003",
    nome: "Tastiera Meccanica",
    categoria: "Accessori",
    prezzo: 89,
  },
  { id: "P004", nome: 'Monitor 27"', categoria: "Monitor", prezzo: 399 },
  { id: "P005", nome: "Webcam HD", categoria: "Accessori", prezzo: 59 },
  { id: "P006", nome: "SSD 1TB", categoria: "Storage", prezzo: 119 },
  { id: "P007", nome: "RAM 32GB DDR5", categoria: "Componenti", prezzo: 149 },
  {
    id: "P008",
    nome: 'Laptop Ultra 13"',
    categoria: "Elettronica",
    prezzo: 999,
  },
  {
    id: "P009",
    nome: "Dock USB-C 10 porte",
    categoria: "Accessori",
    prezzo: 79,
  },
  { id: "P010", nome: "Stampante Laser", categoria: "Stampa", prezzo: 249 },
];

function searchCatalog(term: string) {
  const q = term.toLowerCase();
  return of(
    CATALOG.filter(
      (p) =>
        String(p["nome"]).toLowerCase().includes(q) ||
        String(p["categoria"]).toLowerCase().includes(q) ||
        String(p["id"]).toLowerCase().includes(q),
    ),
  ).pipe(delay(400));
}

// ── Dialog dedicato alla creazione rapida di un prodotto ───────────────────
// Aperto da createFn solo DOPO che il lookup dialog è già stato chiuso,
// quindi non ci sono mai più di un dialog aperto contemporaneamente.

type NewProductForm = Omit<
  { nome: string; categoria: string; prezzo: number },
  never
>;

@Component({
  selector: "app-create-product-dialog",
  standalone: true,
  imports: [ButtonsModule, FormRendererComponent],
  template: `
    <app-form-renderer
      formId="create-product-form"
      [config]="formConfig"
      [form]="form"
      (formSubmit)="onSubmit($event)"
    />
    <div class="cp-footer">
      <button kendoButton type="button" (click)="cancel()">Annulla</button>
      <button
        kendoButton
        themeColor="primary"
        type="submit"
        form="create-product-form"
      >
        Crea prodotto
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cp-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 8px 16px;
        border-top: 1px solid var(--kendo-color-border, #e0e0e0);
      }
    `,
  ],
})
export class CreateProductDialogComponent {
  private readonly dialogRef = inject(DialogRef);
  private readonly engine = inject(FormEngineService);

  readonly formConfig: FormFieldConfig[] = [
    {
      type: FieldType.Input,
      field: "nome",
      label: "Nome prodotto",
      validators: [{ type: ValidatorType.Required }],
    },
    { type: FieldType.Input, field: "categoria", label: "Categoria" },
    { type: FieldType.Input, field: "prezzo", label: "Prezzo" },
  ];
  readonly formModel = signal<NewProductForm>({
    nome: "",
    categoria: "",
    prezzo: 0,
  });

  protected readonly form = this.engine.buildForm(
    this.formModel,
    this.formConfig,
  );

  cancel(): void {
    this.dialogRef.close(null);
  }

  onSubmit(payload: Record<string, unknown>): void {
    this.dialogRef.close(payload);
  }
}

// ── Esempio principale ─────────────────────────────────────────────────────

@Component({
  selector: "app-lookup-example",
  standalone: true,
  imports: [GridRendererComponent, FormDialogComponent, FormRendererComponent],
  templateUrl: "./lookup-example.component.html",
  styleUrl: "./lookup-example.component.scss",
})
export class LookupExampleComponent {
  private readonly dialogService = inject(DialogService);
  private readonly engine = inject(FormEngineService);

  readonly currentId = signal<number | null>(null);
  readonly formConfig: FormFieldConfig[] = this.buildFormConfig();

  readonly formModel = signal<OrdineForm>(EMPTY);
  readonly form = this.engine.buildForm(this.formModel, this.formConfig);

  readonly gridColumns: GridColumnConfig[] = [
    { field: "prodotto", title: "columns.prodotto", display: "option" },
    {
      field: "quantita",
      title: "columns.quantita",
      width: 80,
      filter: "numeric",
    },
    { field: "note", title: "fields.note.label", filter: "text" },
  ];

  readonly gridState = signal<State>({ filter: { filters: [], logic: "and" } });
  readonly orders = signal<OrdineForm[]>(SAMPLE_ORDERS);
  readonly gridData = computed<TypedGridResult<OrdineForm>>(
    () =>
      process(
        this.orders() as unknown as Record<string, unknown>[],
        this.gridState(),
      ) as TypedGridResult<OrdineForm>,
  );

  readonly isNew = signal(false);
  readonly lastPayload = signal<string | null>(null);
  readonly showForm = signal(false);

  cancelForm(): void {
    this.showForm.set(false);
  }

  onCreateClick(): void {
    this.formModel.set(EMPTY);
    this.isNew.set(true);
    this.currentId.set(null);
    this.showForm.set(true);
  }

  onDeleteClick(item: OrdineForm): void {
    this.orders.update((list) => list.filter((o) => o.id !== item.id));
    if (this.currentId() === item.id) this.showForm.set(false);
  }

  onEditClick(item: OrdineForm): void {
    this.formModel.set(item);
    this.isNew.set(false);
    this.currentId.set(item.id);
    this.showForm.set(true);
  }

  onFormSubmit(payload: unknown): void {
    const ordine = payload as unknown as OrdineForm;
    if (this.isNew()) {
      const nextId = Math.max(0, ...this.orders().map((o) => o.id ?? 0)) + 1;
      this.orders.update((list) => [...list, { ...ordine, id: nextId }]);
    } else {
      this.orders.update((list) =>
        list.map((o) => (o.id === ordine.id ? ordine : o)),
      );
    }
    this.lastPayload.set(JSON.stringify(ordine, null, 2));
    this.showForm.set(false);
  }

  onGridStateChange(state: State): void {
    this.gridState.set(state);
  }

  private buildFormConfig(): FormFieldConfig[] {
    return [
      {
        type: FieldType.Input,
        field: "id",
        label: "fields.id.label",
        inputType: "number",
        showInForm: false,
      },
      {
        type: FieldType.Lookup,
        field: "prodotto",
        label: "fields.prodotto.label",
        validators: [{ type: ValidatorType.Required }],
        lookupConfig: {
          minSearchLength: 1,
          valueField: "id",
          labelField: "nome",
          searchFn: searchCatalog,
          columns: [
            { field: "id", title: "columns.codice", width: 80 },
            { field: "nome", title: "columns.prodotto" },
            { field: "categoria", title: "columns.categoria", width: 140 },
            { field: "prezzo", title: "columns.prezzo", width: 100 },
          ],
          createFn: (term) => {
            const result$ = new Subject<FieldOption | null>();

            const ref = this.dialogService.open({
              title: "Nuovo prodotto",
              content: CreateProductDialogComponent,
              minWidth: 360,
              width: 420,
            });

            const instance = ref.content
              .instance as CreateProductDialogComponent;
            instance.formModel.set({ nome: term, categoria: "", prezzo: 0 });

            ref.result.subscribe((res) => {
              if (res instanceof DialogCloseResult || res === null) {
                result$.next(null);
              } else {
                const data = res as unknown as NewProductForm;
                const id = `P${String(CATALOG.length + 1).padStart(3, "0")}`;
                CATALOG.push({
                  id,
                  nome: data.nome,
                  categoria: data.categoria,
                  prezzo: data.prezzo,
                });
                result$.next({ value: id, label: data.nome });
              }
              result$.complete();
            });

            return result$.asObservable();
          },
        },
      },
      {
        type: FieldType.Input,
        field: "quantita",
        label: "fields.quantita.label",
        inputType: "number",
        validators: [
          { type: ValidatorType.Required },
          { type: ValidatorType.Min, value: 1 },
        ],
      },
      {
        type: FieldType.Textarea,
        field: "note",
        label: "fields.note.label",
        placeholder: "fields.note.placeholder",
      },
    ];
  }
}
