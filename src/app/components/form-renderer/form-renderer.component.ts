import { Component, computed, inject, input, output, Signal, Type, untracked } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FieldTree, ValidationError } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldType, FormFieldConfig } from '../../models/form-field-config';
import { FormEngineService } from '../../services/form-engine.service';
import { InputFieldComponent } from '../fields/input-field/input-field.component';
import { TextareaFieldComponent } from '../fields/textarea-field/textarea-field.component';
import { CheckboxFieldComponent } from '../fields/checkbox-field/checkbox-field.component';
import { SelectFieldComponent } from '../fields/select-field/select-field.component';
import { ComboboxFieldComponent } from '../fields/combobox-field/combobox-field.component';
import { ArrayFieldComponent } from '../fields/array-field/array-field.component';
import { DateFieldComponent } from '../fields/date-field/date-field.component';
import { LookupFieldComponent } from '../fields/lookup-field/lookup-field.component';

const FIELD_COMPONENTS: Record<FieldType, Type<unknown>> = {
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
  readonly config = input.required<FormFieldConfig[]>();
  /** Accettato come unknown per compatibilità con qualsiasi FieldTree<T> */
  readonly form   = input.required<FieldTree<T>>();
  readonly formId = input<string>('form-renderer');
  readonly formSubmit = output<Record<string, unknown>>();

  private readonly engine = inject(FormEngineService);

  /**
   * Cache stabile dei FieldTree per campo.
   *
   * Il Proxy di FieldTree legge il model signal come side effect ogni volta che
   * si accede a `formTree[fieldName]`. Se questo accesso avviene dentro un computed(),
   * il model diventa una dipendenza della cache: ogni `value.set(...)` (es. svuotare
   * la combobox) invalida la cache → il Proxy può restituire undefined durante la
   * transizione → "fieldFor(...) is not a function".
   *
   * `untracked()` taglia questa dipendenza: la cache si ricalcola solo quando
   * form o config cambiano, non a ogni modifica di valore.
   */
  private readonly fieldTreeCache = computed(() => {
    const formTree = this.form() as Record<string, unknown>;
    return new Map<string, FieldTree<unknown>>(
      this.config()
        .filter(f => f.showInForm !== false)
        .map(f => [f.field, untracked(() => formTree[f.field]) as FieldTree<unknown>]),
    );
  });

  /**
   * Signal stabile dei valori correnti del form.
   * Passato per riferimento ai field component — si aggiorna reattivamente quando
   * qualsiasi valore cambia, senza invalidare inputsCache (il riferimento è stabile).
   */
  readonly formValuesSignal: Signal<Record<string, unknown>> = computed(() => {
    const tree = this.form() as any;
    const result: Record<string, unknown> = {};
    for (const f of this.config()) {
      const ft = untracked(() => tree[f.field]) as FieldTree<unknown> | undefined;
      if (ft) result[f.field] = ft().value();
    }
    return result;
  });

  /**
   * Cache stabile degli oggetti inputs per NgComponentOutlet.
   * Evita che setInput() venga chiamato con un nuovo oggetto ad ogni CD,
   * il che riscatenava il computed `state` nei field component.
   * `formValues` è il riferimento al signal (stabile), non il suo valore.
   */
  private readonly inputsCache = computed(() =>
    new Map<string, Record<string, unknown>>(
      this.config()
        .filter(f => f.showInForm !== false)
        .map(f => {
          const inputs: Record<string, unknown> = {
            control: this.fieldTreeCache().get(f.field)!,
            config: f,
          };
          if (f.type === FieldType.Select || f.type === FieldType.Combobox) {
            inputs['formValues'] = this.formValuesSignal;
          }
          return [f.field, inputs];
        }),
    ),
  );

  componentFor(field: FormFieldConfig): Type<unknown> {
    return FIELD_COMPONENTS[field.type] ?? InputFieldComponent;
  }

  fieldFor(field: FormFieldConfig): FieldTree<unknown> {
    return this.fieldTreeCache().get(field.field)!;
  }

  inputsFor(field: FormFieldConfig): Record<string, unknown> {
    return this.inputsCache().get(field.field)!;
  }

  /**
   * Errori a livello form (da validateTree / options.validators).
   * Mostrati solo dopo il primo tentativo di submit (root touched).
   */
  readonly formErrors = computed<ValidationError[]>(() => {
    const rootState = (this.form())();
    if (!rootState.touched()) return [];
    return rootState.errors() as ValidationError[];
  });

  onSubmit(event: Event): void {
    event.preventDefault();
    const rootState = (this.form())();
    // Marca tutto il form come touched per mostrare gli errori dei campi
    rootState.markAsTouched();
    if (rootState.invalid()) return;
    this.formSubmit.emit(
      this.engine.serializeValue(this.form() as FieldTree<any>, this.config()),
    );
  }
}
