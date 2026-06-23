import { Component, computed, input, output, signal, Signal, Type, untracked } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FieldTree, ValidationError } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldType, FormFieldConfig } from '../../models/form-field-config';
import { InputFieldComponent } from '../fields/input-field/input-field.component';
import { TextareaFieldComponent } from '../fields/textarea-field/textarea-field.component';
import { CheckboxFieldComponent } from '../fields/checkbox-field/checkbox-field.component';
import { SelectFieldComponent } from '../fields/select-field/select-field.component';
import { ComboboxFieldComponent } from '../fields/combobox-field/combobox-field.component';
import { ArrayFieldComponent } from '../fields/array-field/array-field.component';
import { DateFieldComponent } from '../fields/date-field/date-field.component';
import { LookupFieldComponent } from '../fields/lookup-field/lookup-field.component';

const FIELD_COMPONENTS: Partial<Record<FieldType, Type<unknown>>> = {
  [FieldType.Input]:    InputFieldComponent,
  [FieldType.Textarea]: TextareaFieldComponent,
  [FieldType.Checkbox]: CheckboxFieldComponent,
  [FieldType.Select]:   SelectFieldComponent,
  [FieldType.Combobox]: ComboboxFieldComponent,
  [FieldType.Array]:    ArrayFieldComponent,
  [FieldType.Date]:     DateFieldComponent,
  [FieldType.DateTime]: DateFieldComponent,
  [FieldType.Time]:     DateFieldComponent,
  [FieldType.Lookup]:   LookupFieldComponent,
};

@Component({
  selector: 'app-form-renderer',
  standalone: true,
  imports: [NgComponentOutlet, TranslocoPipe],
  templateUrl: './form-renderer.component.html',
  styleUrl: './form-renderer.component.scss',
})
export class FormRendererComponent<T> {
  readonly config   = input.required<FormFieldConfig[]>();
  readonly form     = input.required<FieldTree<T>>();
  readonly formId   = input<string>('form-renderer');
  readonly columns  = input<number>(1);
  /**
   * Errori server-side per singolo campo: `{ email: 'Email già in uso' }`.
   * Mostrati immediatamente (senza bisogno di touched), sovrascrivono gli errori
   * di validazione. Il parent li gestisce e li azzera quando l'utente modifica il campo.
   */
  readonly serverErrors = input<Record<string, string>>({});
  readonly formSubmit = output<T>();

  readonly FieldType = FieldType;

  private readonly isFieldNode = (f: FormFieldConfig) =>
    f.type !== FieldType.Section && f.showInForm !== false;

  private readonly fieldTreeCache = computed(() => {
    const formTree = this.form() as Record<string, unknown>;
    return new Map<string, FieldTree<unknown>>(
      this.config()
        .filter(this.isFieldNode)
        .map(f => [f.field, untracked(() => formTree[f.field]) as FieldTree<unknown>]),
    );
  });

  readonly formValuesSignal: Signal<Record<string, unknown>> = computed(() => {
    const tree = this.form() as any;
    const result: Record<string, unknown> = {};
    for (const f of this.config()) {
      if (f.type === FieldType.Section) continue;
      const ft = untracked(() => tree[f.field]) as FieldTree<unknown> | undefined;
      if (ft) result[f.field] = ft().value();
    }
    return result;
  });

  private readonly disabledSignals = computed(() =>
    new Map<string, Signal<boolean>>(
      this.config()
        .filter(this.isFieldNode)
        .map(f => {
          const r = f.disabled;
          if (!r) return [f.field, signal(false) as Signal<boolean>];
          if (typeof r === 'boolean') return [f.field, signal(r) as Signal<boolean>];
          const fn = r;
          return [f.field, computed(() => fn(this.formValuesSignal())) as Signal<boolean>];
        }),
    ),
  );

  private readonly inputsCache = computed(() => {
    const se = this.serverErrors();
    return new Map<string, Record<string, unknown>>(
      this.config()
        .filter(this.isFieldNode)
        .map(f => {
          const inputs: Record<string, unknown> = {
            control: this.fieldTreeCache().get(f.field)!,
            config: f,
            serverError: se[f.field] ?? null,
          };
          if (f.type !== FieldType.Array) {
            inputs['disabledSig'] = this.disabledSignals().get(f.field)!;
          }
          if (f.type === FieldType.Select || f.type === FieldType.Combobox) {
            inputs['formValues'] = this.formValuesSignal;
          }
          return [f.field, inputs];
        }),
    );
  });

  componentFor(field: FormFieldConfig): Type<unknown> {
    return FIELD_COMPONENTS[field.type] ?? InputFieldComponent;
  }

  fieldFor(field: FormFieldConfig): FieldTree<unknown> | undefined {
    return this.fieldTreeCache().get(field.field);
  }

  inputsFor(field: FormFieldConfig): Record<string, unknown> {
    return this.inputsCache().get(field.field)!;
  }

  readonly formErrors = computed<ValidationError[]>(() => {
    const rootState = (this.form())();
    if (!rootState.touched()) return [];
    return rootState.errors() as ValidationError[];
  });

  onSubmit(event: Event): void {
    event.preventDefault();
    const rootState = (this.form())();
    rootState.markAsTouched();
    if (rootState.invalid()) return;
    this.formSubmit.emit(rootState.value());
  }
}
