import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { process, State } from '@progress/kendo-data-query';
import { TranslocoService } from '@jsverse/transloco';
import { delay, map, startWith } from 'rxjs/operators';
import { DateTime, Info } from 'luxon';
import { FieldOption, FieldType, FormFieldConfig, GridColumnConfig, ValidatorType } from './models/form-field-config';
import { FormEngineService } from './services/form-engine.service';
import { OptionsLoaderService } from './services/options-loader.service';
import { FormRendererComponent } from './components/form-renderer/form-renderer.component';
import { FormDialogComponent } from './components/form-dialog/form-dialog.component';
import { GridRendererComponent, TypedGridResult } from './components/grid-renderer/grid-renderer.component';
import { DynamicFormExampleComponent } from './components/dynamic-form-example/dynamic-form-example.component';
import { TranslocoPipe } from '@jsverse/transloco';

interface ContattoForm {
  nome: string;
  telefono: string;
  ruolo: FieldOption | null;
}

/** Modello del dominio: weekday è un numero (0 = Lunedì … 6 = Domenica) */
interface PersonForm {
  id: number | null;
  nome: string;
  email: string;
  eta: number | null;
  tipo: FieldOption | null;
  partitaIva: string;
  regione: FieldOption | null;
  citta: FieldOption | null;
  note: string;
  dataNascita: Date | null;
  appuntamento: Date | null;
  orarioPreferito: Date | null;
  oraInizio: string | null;      // "HH:mm:ss" — TimeOnly serializzato da ASP.NET
  scadenza: string | null;       // "yyyy-MM-dd" — DateOnly come stringa ISO
  ultimoAccesso: string | null;  // "yyyy-MM-dd'T'HH:mm:ss" — DateTimeOffset come stringa ISO
  weekday: number | null;
  interessi: FieldOption[];
  newsletter: boolean;
  termini: boolean;
  contatti: ContattoForm[];
}

/**
 * Form/display model: weekday diventa FieldOption | null perché il campo Select
 * lavora con oggetti opzione, non con primitivi.
 * oraInizio rimane string | null — DateFieldComponent gestisce la conversione internamente.
 */
type PersonFormView = Omit<PersonForm, 'weekday'> & {
  weekday: FieldOption | null;
};

const EMPTY: PersonForm = {
  id: null, nome: '', email: '', eta: null, tipo: null,
  partitaIva: '', regione: null, citta: null, note: '',
  dataNascita: null, appuntamento: null, orarioPreferito: null, oraInizio: null,
  scadenza: null, ultimoAccesso: null,
  weekday: null, interessi: [], newsletter: false, termini: false, contatti: [],
};

const SAMPLE_PEOPLE: PersonForm[] = [
  {
    id: 1, nome: 'Mario Rossi', email: 'mario.rossi@esempio.it', eta: 35,
    tipo: { value: 'azienda', label: 'Azienda' },
    partitaIva: 'IT12345678901',
    regione: { value: 'Veneto', label: 'Veneto' },
    citta: { value: '001055', label: 'Ormelle (TV)' },
    note: 'Cliente storico dal 2018.', dataNascita: new Date(1989, 4, 15),
    appuntamento: new Date(2026, 6, 10, 14, 30), orarioPreferito: new Date(0, 0, 0, 9, 0),
    oraInizio: '08:30:00',
    scadenza: '2026-12-31', ultimoAccesso: '2026-05-20T09:15:00',
    weekday: 0,
    interessi: [{ value: 'tecnologia', label: 'Tecnologia' }, { value: 'viaggi', label: 'Viaggi' }],
    newsletter: true, termini: true,
    contatti: [{ nome: 'Anna Rossi', telefono: '+39 333 1234567', ruolo: { value: 'famiglia', label: 'Famiglia' } }],
  },
  {
    id: 2, nome: 'Laura Bianchi', email: 'laura.b@esempio.it', eta: 28,
    tipo: { value: 'privato', label: 'Privato' },
    partitaIva: '',
    regione: { value: 'Lombardia', label: 'Lombardia' },
    citta: null,
    note: '', dataNascita: new Date(1996, 2, 22),
    appuntamento: null, orarioPreferito: null, oraInizio: '14:00:00',
    scadenza: '2027-03-15', ultimoAccesso: '2026-06-01T14:00:00',
    weekday: 2,
    interessi: [{ value: 'musica', label: 'Musica' }, { value: 'lettura', label: 'Lettura' }],
    newsletter: true, termini: true, contatti: [],
  },
  {
    id: 3, nome: 'Giuseppe Esposito', email: 'g.esposito@azienda.it', eta: 52,
    tipo: { value: 'azienda', label: 'Azienda' },
    partitaIva: 'IT98765432101',
    regione: { value: 'Campania', label: 'Campania' },
    citta: null,
    note: 'Fornitore storico.', dataNascita: new Date(1972, 8, 5),
    appuntamento: new Date(2026, 7, 15, 10, 0), orarioPreferito: null, oraInizio: null,
    scadenza: null, ultimoAccesso: '2026-04-10T08:00:00',
    weekday: null,
    interessi: [],
    newsletter: false, termini: true,
    contatti: [{ nome: 'Maria Esposito', telefono: '+39 081 1234567', ruolo: { value: 'famiglia', label: 'Famiglia' } }],
  },
];

/** Giorni della settimana localizzati via Luxon (Lun–Dom, indice 0–6). */
function weekdaysForLocale(locale: string): FieldOption[] {
  return Info.weekdays('long', { locale }).map((label, i) => ({
    value: i,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GridRendererComponent, FormDialogComponent, FormRendererComponent, DynamicFormExampleComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly engine = inject(FormEngineService);
  private readonly loader = inject(OptionsLoaderService);
  private readonly transloco = inject(TranslocoService);

  readonly activeLang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  /** Nomi dei giorni localizzati: si ricalcola ad ogni cambio lingua. */
  readonly weekdays = computed(() => weekdaysForLocale(this.activeLang()));

  setLang(lang: string): void {
    this.transloco.setActiveLang(lang);
  }

  readonly people = signal<PersonForm[]>(SAMPLE_PEOPLE);

  readonly gridState = signal<State>({ skip: 0, take: 5, filter: { filters: [], logic: 'and' } });

  // Mappa PersonForm → PersonFormView prima di passare alla griglia.
  // Dipende da weekdays() per aggiornare le label al cambio lingua.
  readonly gridData = computed<TypedGridResult<PersonFormView>>(() => {
    const wd = this.weekdays();
    return process(
      this.people().map(p => AppComponent.toView(p, wd)) as unknown as Record<string, unknown>[],
      this.gridState(),
    ) as TypedGridResult<PersonFormView>;
  });

  readonly showForm = signal(false);
  readonly isNew    = signal(false);
  readonly currentId = signal<number | null>(null);

  readonly formModel = signal<PersonFormView>(
    AppComponent.toView(EMPTY, weekdaysForLocale(this.transloco.getActiveLang())),
  );
  readonly formConfig: FormFieldConfig[] = this.buildFormConfig();
  readonly form = this.engine.buildForm(this.formModel, this.formConfig, {
    validators: [
      values => values.termini === false && values.nome !== ''
        ? { kind: 'terminiRequired', message: 'Devi accettare i termini per procedere' }
        : null,
    ],
  });

  readonly gridColumns: GridColumnConfig[] = [
    { field: 'nome',        title: 'columns.nome',        filter: 'text' },
    { field: 'email',       title: 'columns.email',       filter: 'text' },
    { field: 'eta',         title: 'columns.eta',         width: 75,  filter: 'numeric' },
    { field: 'tipo',        title: 'columns.tipo',        width: 110, filter: 'combobox',
      filterOptions: [
        { value: 'privato', label: 'Privato' },
        { value: 'azienda', label: 'Azienda' },
      ],
    },
    { field: 'regione',     title: 'columns.regione',     width: 130, filter: 'combobox', filterField: "regioneId",
      filterOptions: this.loader.loadOptions('https://raw.githubusercontent.com/Samurai016/Comuni-ITA/refs/heads/master/data/regioni.json').pipe(
          map(opts => [{ value: '', label: '— Tutte le regioni —', disabled: true }, ...opts])
        )
    },
    { field: 'citta',       title: 'columns.citta',       width: 130, display: 'option', filter: 'text' },
    { field: 'interessi',   title: 'columns.interessi',   filter: 'combobox', filterOperator: 'contains',
      filterOptions: [
        { value: 'sport',      label: 'Sport' },
        { value: 'musica',     label: 'Musica' },
        { value: 'cucina',     label: 'Cucina' },
        { value: 'tecnologia', label: 'Tecnologia' },
        { value: 'viaggi',     label: 'Viaggi' },
        { value: 'lettura',    label: 'Lettura' },
      ],
    },
    { field: 'weekday',     title: 'columns.weekday',     width: 120, filter: 'combobox', sortable: false,
      filterOptions: this.transloco.langChanges$.pipe(startWith(this.transloco.getActiveLang()), map(weekdaysForLocale)),
    },
    { field: 'oraInizio', title: 'columns.oraInizio', width: 90, filter: 'time', filterable: true,
      displayFn: v => v ? (v as string).substring(0, 5) : '',
    },
    { field: 'scadenza',      title: 'columns.scadenza',      width: 120, filter: 'text', filterable: false,
      displayFn: v => v ? DateTime.fromISO(v as string).toFormat('dd/MM/yyyy') : '',
    },
    { field: 'ultimoAccesso', title: 'columns.ultimoAccesso', width: 160, filter: 'text', filterable: false,
      displayFn: v => v ? DateTime.fromISO(v as string).toFormat('dd/MM/yyyy HH:mm') : '',
    },
    { field: 'newsletter',  title: 'columns.newsletter',  width: 110, filter: 'boolean', display: 'boolean' },
    { field: 'dataNascita', title: 'columns.dataNascita', width: 180, filter: 'date', format: 'dd/MM/yyyy' },
  ];

  // La griglia emette PersonFormView (dati già mappati); la serializzazione JSON
  // mostra fromView() così il payload finale ha weekday: number.
  readonly selectedPeople = signal<PersonFormView[]>([]);
  readonly selectedJson = () => JSON.stringify(this.selectedPeople().map(AppComponent.fromView), null, 2);

  lastAction: { label: string; json: string } | null = null;

  onGridStateChange(state: State): void {
    this.gridState.set(state);
  }

  onCreateClick(): void {
    this.formModel.set(AppComponent.toView(EMPTY, this.weekdays()));
    this.isNew.set(true);
    this.currentId.set(null);
    this.showForm.set(true);
  }

  onEditClick(item: PersonFormView): void {
    this.formModel.set(item);
    this.isNew.set(false);
    this.currentId.set(item.id);
    this.showForm.set(true);
  }

  onDeleteClick(item: PersonFormView): void {
    this.people.update(list => list.filter(p => p.id !== item.id));
    this.lastAction = { label: `eliminato #${item.id}`, json: JSON.stringify(AppComponent.fromView(item), null, 2) };
    if (this.currentId() === item.id) this.showForm.set(false);
  }

  onFormSubmit(payload: Record<string, unknown>): void {
    // fromView converte PersonFormView → PersonForm (weekday: FieldOption → number).
    const person = AppComponent.fromView(payload as unknown as PersonFormView);
    if (this.isNew()) {
      const nextId = Math.max(0, ...this.people().map(p => p.id ?? 0)) + 1;
      const created = { ...person, id: nextId };
      this.people.update(list => [...list, created]);
      this.lastAction = { label: 'creato', json: JSON.stringify(created, null, 2) };
    } else {
      this.people.update(list => list.map(p => p.id === person.id ? person : p));
      this.lastAction = { label: `aggiornato #${person.id}`, json: JSON.stringify(person, null, 2) };
    }
    this.showForm.set(false);
  }

  cancelForm(): void {
    this.showForm.set(false);
  }

  onSelectionChange(items: PersonFormView[]): void {
    this.selectedPeople.set(items);
  }

  /** PersonForm → PersonFormView */
  private static toView(p: PersonForm, weekdays: FieldOption[]): PersonFormView {
    return {
      ...p,
      weekday: weekdays.find(d => d.value === p.weekday) ?? null,
    };
  }

  /** PersonFormView → PersonForm */
  private static fromView(v: PersonFormView): PersonForm {
    return {
      ...v,
      weekday: (v.weekday?.value as number) ?? null,
    };
  }

  private buildFormConfig(): FormFieldConfig[] {
    return [
      {
        type: FieldType.Input, field: 'id', label: 'fields.id.label',
        inputType: 'number', showInForm: false,
      },
      {
        type: FieldType.Input, field: 'nome', label: 'fields.nome.label',
        placeholder: 'fields.nome.placeholder', inputType: 'text',
        validators: [
          { type: ValidatorType.Required },
          { type: ValidatorType.MinLength, value: 2 },
        ],
        customValidators: [
          value => typeof value === 'string' && value.startsWith(' ')
            ? { kind: 'noLeadingSpace', message: 'Non può iniziare con uno spazio' }
            : null,
        ],
      },
      {
        type: FieldType.Input, field: 'email', label: 'fields.email.label',
        placeholder: 'fields.email.placeholder', inputType: 'email',
        validators: [
          { type: ValidatorType.Required },
          { type: ValidatorType.Email },
        ],
        asyncValidators: [{
          debounce: 500,
          validate: async (value) => {
            await new Promise(r => setTimeout(r, 300));
            return String(value) === 'test@test.it'
              ? { kind: 'emailTaken', message: 'Email già in uso' }
              : null;
          },
        }],
      },
      {
        type: FieldType.Input, field: 'eta', label: 'fields.eta.label', inputType: 'number',
        validators: [
          { type: ValidatorType.Min, value: 18, message: 'Devi avere almeno 18 anni' },
          { type: ValidatorType.Max, value: 120 },
        ],
      },
      {
        type: FieldType.Select, field: 'tipo', label: 'fields.tipo.label',
        options: of([
          { value: 'privato', label: 'Privato' },
          { value: 'azienda', label: 'Azienda' },
        ]).pipe(delay(300)),
        validators: [{ type: ValidatorType.Required }],
      },
      {
        type: FieldType.Input, field: 'partitaIva', label: 'fields.partitaIva.label',
        placeholder: 'fields.partitaIva.placeholder', inputType: 'text',
        visibleWhen: values => (values['tipo'] as FieldOption | null)?.value === 'azienda',
        validators: [
          { type: ValidatorType.Required },
          { type: ValidatorType.MinLength, value: 11 },
        ],
      },
      {
        type: FieldType.Select, field: 'regione', label: 'fields.regione.label',
        options: this.loader.loadOptions('https://raw.githubusercontent.com/Samurai016/Comuni-ITA/refs/heads/master/data/regioni.json').pipe(
          map(opts => [{ value: '', label: '— Tutte le regioni —', disabled: true }, ...opts]),
        ),
      },
      {
        type: FieldType.Combobox, field: 'citta', label: 'fields.citta.label',
        placeholder: 'fields.citta.placeholder',
        searchFn: term => this.loader.loadOptions('http://127.0.0.1:8080/comuni', { q: term }),
      },
      {
        type: FieldType.Textarea, field: 'note', label: 'fields.note.label',
        placeholder: 'fields.note.placeholder',
        validators: [{ type: ValidatorType.MaxLength, value: 500 }],
      },
      {
        type: FieldType.Date, field: 'dataNascita', label: 'fields.dataNascita.label',
        validators: [{ type: ValidatorType.Required }],
      },
      {
        type: FieldType.DateTime, field: 'appuntamento', label: 'fields.appuntamento.label',
        placeholder: 'fields.appuntamento.placeholder',
      },
      {
        type: FieldType.Time, field: 'orarioPreferito', label: 'fields.orarioPreferito.label',
        placeholder: 'fields.orarioPreferito.placeholder',
      },
      {
        type: FieldType.Time, field: 'oraInizio', label: 'fields.oraInizio.label',
        placeholder: 'fields.oraInizio.placeholder',
      },
      {
        type: FieldType.Date, field: 'scadenza', label: 'fields.scadenza.label',
        placeholder: 'fields.scadenza.placeholder',
      },
      {
        type: FieldType.DateTime, field: 'ultimoAccesso', label: 'fields.ultimoAccesso.label',
        placeholder: 'fields.ultimoAccesso.placeholder',
      },
      {
        type: FieldType.Combobox, field: 'interessi', label: 'fields.interessi.label',
        placeholder: 'fields.interessi.placeholder', multiple: true,
        options: [
          { value: 'sport',      label: 'Sport' },
          { value: 'musica',     label: 'Musica' },
          { value: 'cucina',     label: 'Cucina' },
          { value: 'tecnologia', label: 'Tecnologia' },
          { value: 'viaggi',     label: 'Viaggi' },
          { value: 'lettura',    label: 'Lettura' },
        ],
      },
      {
        type: FieldType.Select, field: 'weekday', label: 'fields.weekday.label',
        options: this.transloco.langChanges$.pipe(startWith(this.transloco.getActiveLang()), map(weekdaysForLocale)),
      },
      {
        type: FieldType.Checkbox, field: 'newsletter',
        label: 'fields.newsletter.label',
      },
      {
        type: FieldType.Checkbox, field: 'termini',
        label: 'fields.termini.label',
        validators: [{ type: ValidatorType.Required }],
      },
      {
        type: FieldType.Array, field: 'contatti', label: 'fields.contatti.label',
        arrayConfig: [
          {
            type: FieldType.Input, field: 'nome', label: 'fields.contatti.nome.label',
            placeholder: 'fields.contatti.nome.placeholder', inputType: 'text',
            validators: [{ type: ValidatorType.Required }],
          },
          {
            type: FieldType.Input, field: 'telefono', label: 'fields.contatti.telefono.label',
            placeholder: 'fields.contatti.telefono.placeholder', inputType: 'tel',
          },
          {
            type: FieldType.Select, field: 'ruolo', label: 'fields.contatti.ruolo.label',
            options: of([
              { value: 'lavoro',   label: 'Lavoro' },
              { value: 'famiglia', label: 'Famiglia' },
              { value: 'altro',    label: 'Altro' },
            ]),
          },
        ],
      },
    ];
  }
}
