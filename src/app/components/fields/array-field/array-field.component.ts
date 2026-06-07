import { Component, computed, input } from '@angular/core';
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
 */
@Component({
  selector: 'app-row-renderer',
  standalone: true,
  imports: [
    InputFieldComponent, TextareaFieldComponent, CheckboxFieldComponent,
    SelectFieldComponent, ComboboxFieldComponent, DateFieldComponent,
    ButtonsModule,
  ],
  templateUrl: './row-renderer.component.html',
  styleUrl: './row-renderer.component.scss',
})
export class RowRendererComponent {
  readonly form        = input.required<FieldTree<Record<string, unknown>>>();
  readonly fieldConfig = input.required<FormFieldConfig>();

  readonly FieldType = FieldType;

  controlFor(): FieldTree<unknown> {
    return (this.form() as any)[this.fieldConfig().field];
  }
}

/**
 * Gestisce un campo di tipo FieldType.Array.
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

  private readonly state = computed(() => (this.control() as any)());

  readonly indices = computed(() =>
    Array.from({ length: (this.state().value() as unknown[]).length }, (_, i) => i),
  );

  itemFieldFor(i: number): FieldTree<Record<string, unknown>> {
    return (this.control() as any)[i];
  }

  addRow(): void {
    const s = this.state();
    s.value.update((arr: unknown[]) => [...arr, this.buildDefaultItem()]);
  }

  removeRow(i: number): void {
    const s = this.state();
    s.value.update((arr: unknown[]) => arr.filter((_, idx) => idx !== i));
  }

  private buildDefaultItem(): Record<string, unknown> {
    const item: Record<string, unknown> = {};
    for (const f of this.config().arrayConfig ?? []) {
      item[f.field] = f.defaultValue ?? this.defaultForType(f.type);
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
