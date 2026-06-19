import { Component, computed, input, Type, untracked } from '@angular/core';
import { plusIcon, trashIcon, SVGIcon } from '@progress/kendo-svg-icons';
import { NgComponentOutlet } from '@angular/common';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { FieldTree } from '@angular/forms/signals';
import { FieldType, FormFieldConfig } from '../../../models/form-field-config';
import { InputFieldComponent } from '../input-field/input-field.component';
import { TextareaFieldComponent } from '../textarea-field/textarea-field.component';
import { CheckboxFieldComponent } from '../checkbox-field/checkbox-field.component';
import { SelectFieldComponent } from '../select-field/select-field.component';
import { ComboboxFieldComponent } from '../combobox-field/combobox-field.component';
import { DateFieldComponent } from '../date-field/date-field.component';

/**
 * Micro-renderer per le singole righe dell'array.
 * Dichiarato prima di ArrayFieldComponent per evitare dipendenze circolari.
 * Per il caso FieldType.Array annidato usa NgComponentOutlet + input `arrayFieldCmp`,
 * evitando l'import statico di ArrayFieldComponent (che non è ancora definito).
 */
@Component({
  selector: 'app-row-renderer',
  standalone: true,
  imports: [
    NgComponentOutlet,
    InputFieldComponent, TextareaFieldComponent, CheckboxFieldComponent,
    SelectFieldComponent, ComboboxFieldComponent, DateFieldComponent,
    ButtonsModule,
  ],
  templateUrl: './row-renderer.component.html',
  styleUrl: './row-renderer.component.scss',
})
export class RowRendererComponent {
  readonly form          = input.required<FieldTree<Record<string, unknown>>>();
  readonly fieldConfig   = input.required<FormFieldConfig>();
  /** Riferimento ad ArrayFieldComponent passato a runtime per evitare la dipendenza circolare. */
  readonly arrayFieldCmp = input<Type<unknown>>();

  readonly FieldType = FieldType;

  controlFor(): FieldTree<unknown> {
    return (this.form() as any)[this.fieldConfig().field];
  }

  /**
   * Inputs stabili per NgComponentOutlet nel caso Array annidato.
   * `untracked` taglia la dipendenza dal model signal (stesso pattern di fieldTreeCache
   * in FormRendererComponent) — evita che ogni value.set() invalidi questo computed.
   */
  readonly nestedArrayInputs = computed(() => {
    const tree  = this.form();
    const field = this.fieldConfig();
    const control = untracked(() => (tree as any)[field.field]);
    return { control, config: field };
  });
}

/**
 * Gestisce un campo di tipo FieldType.Array, con supporto per array annidati e addable.
 */
@Component({
  selector: 'app-array-field',
  standalone: true,
  imports: [RowRendererComponent, ButtonsModule],
  templateUrl: './array-field.component.html',
  styleUrl: './array-field.component.scss',
})
export class ArrayFieldComponent {
  readonly control = input.required<FieldTree<unknown[]>>();
  readonly config  = input.required<FormFieldConfig>();

  /**
   * Self-reference passata a RowRendererComponent per il rendering di array annidati.
   * Property d'istanza (non statica): viene inizializzata alla costruzione dell'oggetto,
   * quando la classe è già definita — nessuna TDZ.
   */
  readonly ArrayFieldRef: Type<unknown> = ArrayFieldComponent as unknown as Type<unknown>;

  readonly iconAdd: SVGIcon   = plusIcon;
  readonly iconRemove: SVGIcon = trashIcon;

  private readonly state = computed(() => (this.control() as any)());

  readonly indices   = computed(() =>
    Array.from({ length: (this.state().value() as unknown[]).length }, (_, i) => i),
  );
  readonly isMutable = computed(() => this.config().mutable !== false);

  itemFieldFor(i: number): FieldTree<Record<string, unknown>> {
    return (this.control() as any)[i];
  }

  addRow(): void {
    this.state().value.update((arr: unknown[]) => [...arr, this.buildDefaultItem()]);
  }

  removeRow(i: number): void {
    this.state().value.update((arr: unknown[]) => arr.filter((_, idx) => idx !== i));
  }

  private buildDefaultItem(): Record<string, unknown> {
    const item: Record<string, unknown> = {};
    for (const f of this.config().arrayConfig ?? []) {
      item[f.field] = f.type === FieldType.Array
        ? []
        : (f.defaultValue ?? this.defaultForType(f.type));
    }
    return item;
  }

  private defaultForType(type: FieldType): unknown {
    if (type === FieldType.Checkbox) return false;
    if (type === FieldType.Select || type === FieldType.Combobox) return null;
    if (type === FieldType.Date || type === FieldType.DateTime || type === FieldType.Time) return null;
    return '';
  }
}
