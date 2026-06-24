import { Component, inject, signal } from '@angular/core';
import { FieldType, FormFieldConfig, ValidatorType } from '../../builder/models/form-field-config';
import { FormEngineService } from '../../builder/services/form-engine.service';
import { FormRendererComponent } from '../../builder/components/form-renderer/form-renderer.component';

interface VoceForm {
  descrizione: string;
  importo: number | null;
}

interface CategoriaForm {
  voci: VoceForm[];
}

interface PreventivoForm {
  categorie: CategoriaForm[];
}

const EMPTY: PreventivoForm = {
  categorie: [
    { voci: [{ descrizione: 'Materiali', importo: 1200 }] },
    { voci: [] },
  ],
};

@Component({
  selector: 'app-nested-array-example',
  standalone: true,
  imports: [FormRendererComponent],
  templateUrl: './nested-array-example.component.html',
  styleUrl: './nested-array-example.component.scss',
})
export class NestedArrayExampleComponent {
  private readonly engine = inject(FormEngineService);

  readonly formConfig: FormFieldConfig[] = [
    {
      type: FieldType.Array,
      field: 'categorie',
      label: 'Categorie',
      mutable: false,
      arrayConfig: [
        {
          type: FieldType.Array,
          field: 'voci',
          label: 'Voci',
          mutable: true,
          arrayConfig: [
            {
              type: FieldType.Input, field: 'descrizione', label: 'Descrizione',
              inputType: 'text',
              validators: [{ type: ValidatorType.Required }],
            },
            {
              type: FieldType.Input, field: 'importo', label: 'Importo (€)',
              inputType: 'number',
            },
          ],
        },
      ],
    },
  ];

  readonly model = signal<PreventivoForm>(EMPTY);

  readonly form = this.engine.buildForm(this.model, this.formConfig);

  lastPayload: string | null = null;

  onSubmit(payload: PreventivoForm): void {
    this.lastPayload = JSON.stringify(payload, null, 2);
  }
}
