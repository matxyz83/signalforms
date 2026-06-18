import { Component, input, output } from '@angular/core';
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-form-dialog',
  standalone: true,
  imports: [DialogModule, ButtonsModule, TranslocoPipe],
  templateUrl: './form-dialog.component.html',
  styleUrl: './form-dialog.component.scss',
})
export class FormDialogComponent {
  readonly open        = input<boolean>(false);
  readonly title       = input<string>('');
  readonly formId      = input<string>('form-wrapper');
  readonly submitLabel = input<string>('Salva');
  readonly width    = input<number>(580);

  readonly cancel = output<void>();
}
