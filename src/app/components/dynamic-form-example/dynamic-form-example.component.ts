import { Component, computed, inject, signal } from '@angular/core';
import { process, State } from '@progress/kendo-data-query';
import {
  DynamicFieldConfig, DynamicGridColumnConfig,
  FieldOption, FieldType, FormFieldConfig, GridColumnConfig, ValidatorType,
} from '../../models/form-field-config';
import { DynamicFormService } from '../../services/dynamic-form.service';
import { FormEngineService } from '../../services/form-engine.service';
import { FormRendererComponent } from '../form-renderer/form-renderer.component';
import { FormDialogComponent } from '../form-dialog/form-dialog.component';
import { GridRendererComponent, TypedGridResult } from '../grid-renderer/grid-renderer.component';

/** Entità con campi statici + campi dinamici serializzati in `data` */
interface MemberEntity {
  id: number | null;
  nome: string;
  data: string;
}

/** Modello form/grid: `data` espanso in campi flat */
type MemberView = Omit<MemberEntity, 'data'> & {
  livello: FieldOption | null;
  priorita: number | null;
  notifiche: boolean;
};

// ─── Config dinamica (simulazione risposta API/DB) ───────────────────────────

const DYNAMIC_FIELDS: DynamicFieldConfig[] = [
  {
    type: FieldType.Select,
    field: 'livello',
    label: 'Livello abbonamento',
    options: [
      { value: 'bronzo', label: 'Bronzo' },
      { value: 'argento', label: 'Argento' },
      { value: 'oro', label: 'Oro' },
    ],
    validators: [{ type: ValidatorType.Required }],
  },
  {
    type: FieldType.Input,
    field: 'priorita',
    label: 'Priorità (1–10)',
    inputType: 'number',
    defaultValue: null,
    // Regola dichiarativa: visibile solo se livello === 'oro'
    // DynamicFormService.toFormConfig() la converte in lambda visibleWhen
    visibleWhen: { field: 'livello', operator: 'eq', value: 'oro' },
    validators: [
      { type: ValidatorType.Required },
      { type: ValidatorType.Min, value: 1 },
      { type: ValidatorType.Max, value: 10 },
    ],
  },
  {
    type: FieldType.Checkbox,
    field: 'notifiche',
    label: 'Abilita notifiche email',
    defaultValue: false,
  },
];

const DYNAMIC_COLUMNS: DynamicGridColumnConfig[] = [
  {
    field: 'livello',
    title: 'Livello',
    width: 120,
    filter: 'combobox',
    display: 'option',
    filterOptions: [
      { value: 'bronzo', label: 'Bronzo' },
      { value: 'argento', label: 'Argento' },
      { value: 'oro', label: 'Oro' },
    ],
  },
  {
    field: 'notifiche',
    title: 'Notifiche',
    width: 100,
    display: 'boolean',
    filterable: false,
    sortable: false,
  },
];

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
  private readonly engine     = inject(FormEngineService);
  private readonly dynService = inject(DynamicFormService);

  // Config form completa: statica + dinamica convertita
  readonly fullFormConfig: FormFieldConfig[] = [
    ...STATIC_FORM_CONFIG,
    ...this.dynService.toFormConfig(DYNAMIC_FIELDS),
  ];

  // Colonne grid: statiche + dinamiche convertite
  readonly gridColumns: GridColumnConfig[] = [
    ...STATIC_GRID_COLUMNS,
    ...this.dynService.toGridColumns(DYNAMIC_COLUMNS),
  ];

  readonly members   = signal<MemberEntity[]>(SAMPLE_MEMBERS);
  readonly gridState = signal<State>({ filter: { filters: [], logic: 'and' } });

  readonly gridData = computed<TypedGridResult<MemberView>>(() =>
    process(
      this.members().map(m => this.toView(m)) as unknown as Record<string, unknown>[],
      this.gridState(),
    ) as TypedGridResult<MemberView>
  );

  readonly formModel = signal<MemberView>(this.emptyView());
  readonly form      = this.engine.buildForm(this.formModel, this.fullFormConfig);

  readonly showForm  = signal(false);
  readonly isNew     = signal(false);
  readonly currentId = signal<number | null>(null);

  showConfigJson = false;
  lastPayload: string | null = null;

  /** Config JSON visualizzata nel pannello "Mostra config" */
  readonly dynConfigJson = JSON.stringify(DYNAMIC_FIELDS, null, 2);

  onGridStateChange(state: State): void {
    this.gridState.set(state);
  }

  onCreateClick(): void {
    this.formModel.set(this.emptyView());
    this.isNew.set(true);
    this.currentId.set(null);
    this.showForm.set(true);
  }

  onEditClick(item: MemberView): void {
    this.formModel.set(item);
    this.isNew.set(false);
    this.currentId.set(item.id);
    this.showForm.set(true);
  }

  onDeleteClick(item: MemberView): void {
    this.members.update(list => list.filter(m => m.id !== item.id));
  }

  onFormSubmit(payload: Record<string, unknown>): void {
    // collapsePayload ricollassa i campi dinamici flat nel campo data: string
    const entity = this.dynService.collapsePayload(payload, DYNAMIC_FIELDS) as unknown as MemberEntity;
    this.lastPayload = JSON.stringify(entity, null, 2);

    if (this.isNew()) {
      const nextId = Math.max(0, ...this.members().map(m => m.id ?? 0)) + 1;
      this.members.update(list => [...list, { ...entity, id: nextId }]);
    } else {
      this.members.update(list => list.map(m => m.id === entity.id ? entity : m));
    }
    this.showForm.set(false);
  }

  cancelForm(): void {
    this.showForm.set(false);
  }

  /** Espande data: string → campi flat per grid e form */
  private toView(m: MemberEntity): MemberView {
    const dyn = this.dynService.parseData(m.data, DYNAMIC_FIELDS);
    return {
      id:        m.id,
      nome:      m.nome,
      livello:   dyn['livello']   as FieldOption | null,
      priorita:  dyn['priorita']  as number | null,
      notifiche: (dyn['notifiche'] as boolean) ?? false,
    };
  }

  private emptyView(): MemberView {
    const dyn = this.dynService.parseData(null, DYNAMIC_FIELDS);
    return { id: null, nome: '', ...dyn } as MemberView;
  }
}
