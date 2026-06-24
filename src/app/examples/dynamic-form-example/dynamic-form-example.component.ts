import { Component, computed, inject, signal } from '@angular/core';
import { process, State } from '@progress/kendo-data-query';
import {
  DynamicFieldConfig, DynamicGridColumnConfig,
  FieldType, FormFieldConfig, GridColumnConfig, ValidatorType,
} from '../../builder/models/form-field-config';
import { DynamicFormService } from '../../builder/services/dynamic-form.service';
import { FormEngineService } from '../../builder/services/form-engine.service';
import { FormDialogComponent } from '../../builder/components/form-dialog/form-dialog.component';
import { GridRendererComponent, TypedGridResult } from '../../builder/components/grid-renderer/grid-renderer.component';
import { FormRendererComponent } from "../../builder/components/form-renderer/form-renderer.component";

/** Entità con campi statici + campi dinamici serializzati in `data` */
interface MemberEntity {
  id: number | null;
  nome: string;
  data: string;
}

// ─── Simulazione risposta API/DB ─────────────────────────────────────────────
// In produzione: http.get<ApiSchema>('/api/member-schema')
// Il frontend non conosce i nomi né i tipi dei campi dinamici.

const API_SCHEMA_JSON = `{
  "formColumns": 2,
  "fields": [
    {
      "type": "select",
      "field": "livello",
      "label": "fields.dynamic.level",
      "options": [
        { "value": "bronzo", "label": "Bronzo" },
        { "value": "argento", "label": "Argento" },
        { "value": "oro",     "label": "Oro" }
      ],
      "validators": [{ "type": "required" }],
      "colSpan": 2
    },
    {
      "type": "input",
      "field": "priorita",
      "label": "Priorità (1–10)",
      "inputType": "number",
      "defaultValue": null,
      "visibleWhen": { "field": "livello", "operator": "eq", "value": "oro" },
      "validators": [
        { "type": "required" },
        { "type": "min", "value": 1 },
        { "type": "max", "value": 10 }
      ]
    },
    {
      "type": "checkbox",
      "field": "notifiche",
      "label": "Abilita notifiche email",
      "defaultValue": false
    }
  ],
  "gridColumns": [
    {
      "field": "livello",
      "title": "fields.dynamic.level",
      "width": 120,
      "filter": "combobox",
      "display": "option",
      "filterOptions": [
        { "value": "bronzo", "label": "Bronzo" },
        { "value": "argento", "label": "Argento" },
        { "value": "oro",     "label": "Oro" }
      ]
    },
    {
      "field": "notifiche",
      "title": "Notifiche",
      "width": 100,
      "display": "boolean",
      "filterable": false,
      "sortable": false
    }
  ]
}`;

interface ApiSchema {
  formColumns:  number;
  fields:       DynamicFieldConfig[];
  gridColumns:  DynamicGridColumnConfig[];
}

const { formColumns: FORM_COLUMNS, fields: DYNAMIC_FIELDS, gridColumns: DYNAMIC_COLUMNS } =
  JSON.parse(API_SCHEMA_JSON) as ApiSchema;

// ─── Config statica (a codice) ───────────────────────────────────────────────

const STATIC_FORM_CONFIG: FormFieldConfig[] = [
  {
    type: FieldType.Input, field: 'id', label: 'ID',
    inputType: 'number', showInForm: false,
  },
  {
    type: FieldType.Input, field: 'nome', label: 'Nome',
    inputType: 'text',
    validators: [{ type: ValidatorType.Required }, { type: ValidatorType.MinLength, value: 2 }],
  },
];

const STATIC_GRID_COLUMNS: GridColumnConfig[] = [
  { field: 'nome', title: 'Nome', filter: 'text' },
];

// ─── Dati di esempio ─────────────────────────────────────────────────────────

const SAMPLE_MEMBERS: MemberEntity[] = [
  {
    id: 1, nome: 'Alice Verdi',
    data: JSON.stringify({ livello: { value: 'oro', label: 'Oro' }, priorita: 7, notifiche: true }),
  },
  {
    id: 2, nome: 'Bob Neri',
    data: JSON.stringify({ livello: { value: 'argento', label: 'Argento' }, priorita: null, notifiche: false }),
  },
  {
    id: 3, nome: 'Carlo Blu',
    data: JSON.stringify({ livello: null, priorita: null, notifiche: true }),
  },
];

// ─── Componente ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-dynamic-form-example',
  standalone: true,
  imports: [GridRendererComponent, FormDialogComponent, FormRendererComponent],
  templateUrl: './dynamic-form-example.component.html',
  styleUrl: './dynamic-form-example.component.scss',
})
export class DynamicFormExampleComponent {
  private readonly dynService = inject(DynamicFormService);
  private readonly engine     = inject(FormEngineService);

  // Config form completa: statica + dinamica convertita
  readonly fullFormConfig: FormFieldConfig[] = [
    ...STATIC_FORM_CONFIG,
    ...this.dynService.toFormConfig(DYNAMIC_FIELDS),
  ];

  readonly formModel = signal<Record<string, unknown>>(this.emptyView());
  readonly form      = this.engine.buildForm(this.formModel, this.fullFormConfig);

  readonly currentId = signal<number | null>(null);
  /** JSON grezzo ricevuto dall'"API" — mostrato nel pannello di debug */
  readonly dynConfigJson = API_SCHEMA_JSON;

  readonly formColumns = FORM_COLUMNS;

  // Colonne grid: statiche + dinamiche convertite
  readonly gridColumns: GridColumnConfig[] = [
    ...STATIC_GRID_COLUMNS,
    ...this.dynService.toGridColumns(DYNAMIC_COLUMNS),
  ];
  readonly gridState = signal<State>({ filter: { filters: [], logic: 'and' } });

  readonly members   = signal<MemberEntity[]>(SAMPLE_MEMBERS);
  readonly gridData = computed<TypedGridResult<Record<string, unknown>>>(() =>
    process(
      this.members().map(m => this.toView(m)),
      this.gridState(),
    ) as TypedGridResult<Record<string, unknown>>
  );
  readonly isNew     = signal(false);

  lastPayload: string | null = null;
  showConfigJson = false;

  readonly showForm  = signal(false);

  cancelForm(): void {
    this.showForm.set(false);
  }

  onCreateClick(): void {
    this.formModel.set(this.emptyView());
    this.isNew.set(true);
    this.currentId.set(null);
    this.showForm.set(true);
  }

  onDeleteClick(item: Record<string, unknown>): void {
    this.members.update(list => list.filter(m => m.id !== item['id']));
  }

  onEditClick(item: Record<string, unknown>): void {
    this.formModel.set(item);
    this.isNew.set(false);
    this.currentId.set(item['id'] as number | null);
    this.showForm.set(true);
  }

  onFormSubmit(payload: unknown): void {
    // collapsePayload ricollassa i campi dinamici flat nel campo data: string
    const entity = this.dynService.collapsePayload(payload as Record<string, unknown>, DYNAMIC_FIELDS) as unknown as MemberEntity;
    this.lastPayload = JSON.stringify(entity, null, 2);

    if (this.isNew()) {
      const nextId = Math.max(0, ...this.members().map(m => m.id ?? 0)) + 1;
      this.members.update(list => [...list, { ...entity, id: nextId }]);
    } else {
      this.members.update(list => list.map(m => m.id === entity.id ? entity : m));
    }
    this.showForm.set(false);
  }

  onGridStateChange(state: State): void {
    this.gridState.set(state);
  }

  private emptyView(): Record<string, unknown> {
    return { id: null, nome: '', ...this.dynService.parseData(null, DYNAMIC_FIELDS) };
  }

  /** Espande data: string → campi flat per grid e form */
  private toView(m: MemberEntity): Record<string, unknown> {
    return { id: m.id, nome: m.nome, ...this.dynService.parseData(m.data, DYNAMIC_FIELDS) };
  }
}
