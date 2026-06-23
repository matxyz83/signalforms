# SignalForms — note di progetto

## Stack

- **Angular 22** — standalone components, `input()` / `output()` signal API, `@for` / `@if` / `@switch` control flow
- **`@angular/forms/signals`** — API ufficiale Angular 22 Signal Forms (inclusa in `@angular/forms ^22.0.0`)
- **Zone.js** — obbligatorio (Kendo non funziona in modalità zoneless, vedi sotto)
- **Kendo Angular `v24.1.0-develop.1`** — unica versione compatibile con Angular 22; le v24.x stabili supportano solo Angular 19–21
- **RxJS 7** — `toSignal` / `toObservable` da `@angular/core/rxjs-interop`
- **`@jsverse/transloco`** — internazionalizzazione; file JSON in `public/i18n/{lang}.json`; lingue: `it` (default), `en`
- **Luxon** (`luxon ^3.7.2`, `@types/luxon ^3.7.1`) — parsing e formatting date/time; usato per convertire tra `Date` JS e stringhe con formato (es. ASP.NET `TimeOnly`)
- **Node 24** — richiesto da Angular 22 CLI (minimo 22.22.3; usare `nvm use 24`)

## Avviare il dev server

```bash
nvm use 24
npx ng serve --host 0.0.0.0 --port 4200
```

> **WSL2**: il file watcher NON rileva modifiche su `/mnt/d/`. Dopo ogni modifica riavviare manualmente:
> ```bash
> kill $(lsof -ti:4200) && nohup npx ng serve --host 0.0.0.0 --port 4200 > /tmp/ng-serve.log 2>&1 &
> until grep -q "localhost:4200" /tmp/ng-serve.log; do sleep 3; done
> ```

## Configurazione obbligatoria (Kendo + Angular 22)

Sei fix necessari, tutti già applicati:

1. **Versione Kendo** `^v24.1.0-develop.1` in `package.json`
2. **NO zoneless** — non usare `provideZonelessChangeDetection()`; Kendo usa `NgZone` per popup/dropdown/positioning
3. **`$localize`** — `@angular/localize/init` nei polyfills di `angular.json` (richiesto da `kendo-angular-label`)
4. **Animazioni** — `provideAnimationsAsync()` in `app.config.ts` (richiesto da datepicker, combobox, dropdown)
5. **Template ref in `@if`/`@else`** — le variabili `#ref` dentro blocchi condizionali sono fuori scope; usare `[id]="config().field"` sul componente e `[for]="config().field"` (stringa) sulla `kendo-label`
6. **Polyfills** in `angular.json`: `["zone.js", "@angular/localize/init"]`

## Architettura

### Struttura cartelle

```
src/app/
├── app.component.{ts,html,scss}   # Shell principale (grid + form dialog + sezione esempi)
├── app.config.ts
├── transloco-loader.ts
├── builder/                        # Libreria riusabile: motore form/grid
│   ├── components/
│   │   ├── fields/                 # Componenti campo (uno per FieldType)
│   │   │   ├── array-field/
│   │   │   ├── checkbox-field/
│   │   │   ├── combobox-field/
│   │   │   ├── date-field/
│   │   │   ├── input-field/
│   │   │   ├── lookup-field/
│   │   │   ├── select-field/
│   │   │   └── textarea-field/
│   │   ├── form-dialog/
│   │   ├── form-renderer/
│   │   └── grid-renderer/
│   ├── models/
│   │   └── form-field-config.ts    # Tutti i tipi (FieldType, FormFieldConfig, GridColumnConfig, …)
│   ├── services/
│   │   ├── dynamic-form.service.ts # Parser JSON schema → FormFieldConfig
│   │   └── form-engine.service.ts  # buildForm(), serializeValue()
│   └── utils/
│       └── field-error.ts
├── examples/                       # Demo standalone (non fanno parte della libreria)
│   ├── dynamic-form-example/
│   ├── lookup-example/
│   └── nested-array-example/
└── services/
    └── options-loader.service.ts   # Cache HTTP per opzioni (usato da AppComponent e esempi)
```

### Modelli (`src/app/builder/models/`)

| File | Contenuto |
|------|-----------|
| `form-field-config.ts` | `FieldType`, `ValidatorType`, `AnyValidator`, `FormFieldConfig`, `FormBuildOptions<T>`, `AsyncValidatorConfig`, `GridColumnConfig`, `GridOptionsLoader`, `OptionsLoader` |

`signal-forms.types.ts` e `signal-forms.impl.ts` sono stati **eliminati** — sostituiti dall'API ufficiale `@angular/forms/signals`.

**`FieldType` disponibili:** `Input`, `Select`, `Combobox`, `Checkbox`, `Textarea`, `Array`, `Date`, `DateTime`, `Time`, `Lookup`, `Section`

**`FieldType.Section`** — separatore visivo con label opzionale. Non crea nodi nel `FieldTree`, non compare nel payload serializzato. Usato esclusivamente per raggruppare campi visivamente nel renderer.
- Per default occupa tutta la larghezza (`colSpan ?? columns()`).
- Accetta `label` (chiave Transloco), `colSpan`, `colStart` come gli altri campi.
- Il campo `field` deve essere univoco nella config (usare prefisso `_s_`, es. `_s_anagrafica`).

```typescript
{ type: FieldType.Section, field: '_s_anagrafica', label: 'fields.section.anagrafica' },
{ type: FieldType.Input,   field: 'nome',          label: 'fields.nome.label' },
{ type: FieldType.Input,   field: 'email',         label: 'fields.email.label' },
{ type: FieldType.Section, field: '_s_credenziali', label: 'fields.section.credenziali' },
{ type: FieldType.Input,   field: 'password',      label: 'fields.password.label' },
```

**`OptionsLoader`** — type alias per i tre formati supportati da `options`:
```typescript
type OptionsLoader = FieldOption[] | Observable<FieldOption[]> | ((state: Record<string, unknown>) => FieldOption[] | Observable<FieldOption[]>);
```

**`FormFieldConfig` — campi chiave:**

| Campo | Tipo | Scopo |
|-------|------|-------|
| `field` | `string` | Chiave univoca — corrisponde alla proprietà nel modello tipizzato |
| `options` | `OptionsLoader` | Opzioni statiche, Observable, o lambda `(state) => …` per cascading |
| `searchFn` | `(term: string) => Observable<FieldOption[]>` | Ricerca server-side per combobox |
| `visibleWhen` | `(values: Record<string, unknown>) => boolean` | Visibilità condizionale; internamente mappata a `hidden()` |
| `validators` | `AnyValidator[]` | Lista unificata: `ValidatorConfig` (standard), `CustomValidatorFn` (sync custom), `AsyncValidatorConfig` (async) — discriminati a runtime in `FormEngineService` |
| `multiple` | `boolean` | Multiselect su Select e Combobox |
| `inputType` | `InputType` | Tipo HTML input (`text` \| `email` \| `number` \| `tel` \| `url` \| `password` \| `search` \| `color`) |
| `showInForm` | `boolean?` | `false` → campo nascosto nel form ma presente nel modello e nel payload (es. ID record). Default `undefined` = visibile. |
| `format` | `string?` | Formato di visualizzazione per i picker data/ora (es. `'dd/MM/yyyy HH:mm:ss'`). Sovrascrive il default del tipo. |
| `arrayConfig` | `FormFieldConfig[]` | Sotto-configurazione dei campi di ogni riga (solo `FieldType.Array`) |
| `defaultValue` | `unknown` | Valore di default per ogni nuovo item array (`buildDefaultItem` lo usa; fallback su `defaultForType`) |
| `colSpan` | `number?` | Numero di colonne occupate nel layout grid del renderer (default `1`). Richiede `[columns]` > 1 su `FormRendererComponent`. Usare il valore uguale a `columns` per occupare tutta la larghezza (es. `Textarea`, `Array`). |
| `colStart` | `number?` | Colonna di partenza 1-based (`grid-column-start` CSS). Se omesso il campo segue il flusso automatico. Combinato con `colSpan` genera `grid-column: <colStart> / span <colSpan>`. Esempio Bootstrap-like con `columns=12`: `colStart: 3, colSpan: 5` → colonne 3–7, 2 slot vuoti prima e 5 dopo. |

> `resolveOption` è stato **eliminato** — i valori combobox/select sono ora `FieldOption` completi, il label viaggia con il valore.

**`FormBuildOptions<T>`** — passato come terzo argomento a `buildForm()`:
- `validators` — array di validatori form-level sincroni cross-field: `(values: T) => {kind, message?} | {kind, message?}[] | null | undefined | void`

**`GridOptionsLoader`** — opzioni per il filtro combobox della grid:
```typescript
type GridOptionsLoader = FieldOption[] | Observable<FieldOption[]> | (() => Observable<FieldOption[]>);
```
Simile a `OptionsLoader` ma senza parametro di stato (la grid non ha form state). Risolto reattivamente da `GridRendererComponent` via `toObservable(columns)` + `switchMap` + `combineLatest`.

**`GridColumnConfig` — campi chiave:**

| Campo | Tipo | Scopo |
|-------|------|-------|
| `field` | `string` | Chiave del campo nel dato |
| `title` | `string` | Chiave Transloco per l'intestazione colonna |
| `width` | `number` | Larghezza colonna in px |
| `filterable` | `boolean` | `false` disabilita il filtro su questa colonna (default `true`) |
| `sortable` | `boolean` | `false` disabilita l'ordinamento su questa colonna (default `true`) |
| `filter` | `'text' \| 'numeric' \| 'date' \| 'boolean' \| 'combobox' \| 'time'` | Tipo filtro inline. `'date'` usa `kendo-datepicker` con formato `dd/MM/yyyy` (evita il formato americano del browser); filtro emesso via `stateChange` → `process()`. `'combobox'` abilita selezione da lista. `'time'` usa `kendo-timepicker` con confronto solo ore/minuti/secondi (gestito internamente, non via `process()`). Tutti e tre usano template custom che sostituiscono l'editor built-in di Kendo |
| `format` | `string` | Formato per la cella. Accetta sia la sintassi plain Luxon (`'HH:mm:ss'`, `'dd/MM/yyyy'`) sia la notazione Kendo (`'{0:d}'`); `columnFormat()` aggiunge il wrapper `{0:…}` automaticamente. Per le colonne `filter: 'time'` il default è `'HH:mm:ss'` |
| `filterOptions` | `GridOptionsLoader` | Opzioni per il filtro combobox: statiche, Observable, o factory |
| `filterOperator` | `string` | Operatore filtro (default `'eq'`; usare `'contains'` per campi `FieldOption[]`) |
| `filterField` | `string` | Campo da usare in `serverStateChange` al posto di `field.value` (es. `'regioneId'` per `regione`) |
| `display` | `'text' \| 'option' \| 'boolean'` | Modalità rendering cella: `'option'` → `labelForValue()`, `'boolean'` → checkbox readonly, `'text'` o omesso → default Kendo |
| `displayFn` | `(value: unknown) => string` | Formatter personalizzato per la cella — ha priorità su `display` e `format`. Usare per valori non supportati da `[format]` Kendo (es. stringhe ISO date). Esempio: `(v) => v ? DateTime.fromISO(v as string).toFormat('dd/MM/yyyy') : ''` |

### Servizi

**`src/app/builder/services/`**

- **`FormEngineService`** — orchestra l'API ufficiale Angular Signal Forms
  - `buildForm<T>(model: WritableSignal<T>, config: FormFieldConfig[], options?: FormBuildOptions<T>): FieldTree<T>`
    — chiama `form()` da `@angular/forms/signals`; itera `validators: AnyValidator[]` discriminando `typeof v === 'function'` (custom sync), `'validate' in v` (async), altrimenti builtin; mappa `visibleWhen` → `hidden()`; gestisce `applyEach()` per i campi array
  - `serializeValue(fieldTree, config): Record<string, unknown>` — esclude i campi con `hidden() === true`
  - I validatori async usano `resource()` da `@angular/core` avvolto in `runInInjectionContext`

- **`DynamicFormService`** — parser JSON schema → `FormFieldConfig[]` (usato da `DynamicFormExampleComponent`)

**`src/app/services/`**

- **`OptionsLoaderService`** — `loadOptions(url, params)` con cache in-memory (non sotto `builder/` perché usato anche da `AppComponent`)

### Componenti field (`src/app/builder/components/fields/`)

Tutti i componenti usano file separati (`templateUrl` + `styleUrl`): ogni cartella contiene `.ts`, `.html` e `.scss`.

Tutti i componenti ricevono `control: FieldTree<unknown>` e derivano lo stato con:
```typescript
readonly state = computed(() => this.control()());  // → FieldState<unknown>
```

`select-field` e `combobox-field` ricevono anche `formValues: Signal<Record<string, unknown>>` (passato da `FormRendererComponent`) per supportare `options` come lambda di stato.

| Componente | File nella cartella | Kendo | Note |
|------------|---------------------|-------|------|
| `input-field` | `input-field.component.{ts,html,scss}` | `kendo-textbox` / `kendo-numerictextbox` | Switcha su `inputType === 'number'` |
| `textarea-field` | `textarea-field.component.{ts,html,scss}` | `kendoTextArea` directive | Template ref `#areaRef` per `kendo-label` |
| `checkbox-field` | `checkbox-field.component.{ts,html,scss}` | `kendoCheckBox` directive | ID stringa |
| `select-field` | `select-field.component.{ts,html,scss}` | `kendo-dropdownlist` / `kendo-multiselect` | Valore = `FieldOption \| null`; `resolvedOptionsObs` con `runInInjectionContext` per lambda state |
| `combobox-field` | `combobox-field.component.{ts,html,scss}` | `kendo-combobox` / `kendo-multiselect` | Valore = `FieldOption \| null`; external/internal filter; in edit mode aggiunge il valore corrente a `displayData` |
| `date-field` | `date-field.component.{ts,html,scss}` | `kendo-datepicker` / `kendo-datetimepicker` / `kendo-timepicker` | Unico componente per tutti e tre i tipi. Accetta sia `Date` che `string` — vedi sezione "Date come stringhe". `[format]="displayFormat()"` su tutti i picker — formato italiano fisso (`dd/MM/yyyy`, `dd/MM/yyyy HH:mm`, `HH:mm`) |
| `array-field` | `array-field.component.ts` + 4 file `{array-field,row-renderer}.component.{html,scss}` | `kendoButton` | `ArrayFieldComponent` + `RowRendererComponent` nello stesso `.ts` (dipendenza circolare); template e stili separati; `config().label` non usa `\| transloco` |

**Valori combobox/select — `FieldOption` completi:**
- I campi Select e Combobox memorizzano `FieldOption | null` (o `FieldOption[]` per `multiple`), non primitivi.
- Il label è parte del valore, non viene risolto a posteriori.
- `visibleWhen` e altri comparatori devono usare `.value` per confrontare: `(values['tipo'] as FieldOption | null)?.value === 'azienda'`.
- **`valuePrimitive`** non viene impostato sui componenti Kendo (default `false`) — il componente restituisce l'oggetto completo.
- **Kendo `defaultItem`** in `select-field`: ha `value: null`; `onValueChange` normalizza a `null` quando `opt.value == null`.

**Binding con `FieldState`:**
- Lettura valore: `state().value()`
- Scrittura: `state().value.set(v)`
- Touch/dirty: `state().markAsTouched()`, `state().markAsDirty()`
- Errori: `state().errors()` → `ValidationError[]` (kind + message)
- Visibilità: `state().hidden()` → `boolean`

### Form Renderer (`src/app/builder/components/form-renderer/`)

File: `form-renderer.component.{ts,html,scss}`

- `NgComponentOutlet` + `[ngComponentOutletInputs]` per rendering dinamico
- `FIELD_COMPONENTS: Partial<Record<FieldType, Type<unknown>>>` come registry statico; `Section` non è nel registry (gestito inline nel template)
- `form` input tipizzato `unknown` (accetta qualsiasi `FieldTree<T>`)
- `fieldFor(field)` → `fieldTreeCache().get(field.field)` per accesso al `FieldTree` del campo (undefined per Section)
- Visibilità nel template: `@if (!fieldFor(field)?.()?.hidden())` (opzionale per Section)
- **`formValuesSignal`** — `computed()` che legge `ft().value()` di ogni campo; il riferimento è stabile (passato come signal, non come valore) → `inputsCache` non si invalida ad ogni digitazione. Passato solo a `Select` e `Combobox` field (gli unici che dichiarano `formValues` input).
- **`columns`** — `input<number>(1)`; controlla il numero di colonne del layout CSS Grid tramite la custom property `--form-columns`. Default `1` (singola colonna, comportamento invariato). Usare insieme a `colSpan` nei campi per il layout multi-colonna.
- **`serverErrors`** — `input<Record<string, string>>({})` — errori server-side per campo (`{ email: 'Email già in uso' }`). Mostrati immediatamente (senza `touched`), sovrascrivono gli errori di validazione. Il parent li gestisce come `WritableSignal<Record<string, string>>`:

```html
<app-form-renderer
  [columns]="2"
  [config]="formConfig"
  [form]="form"
  [serverErrors]="serverErrors()"
  (formSubmit)="onSubmit($event)"
/>
```

```typescript
// Pattern completo — errori server + sezioni
readonly serverErrors = signal<Record<string, string>>({});

onSubmit(payload): void {
  this.api.save(payload).subscribe({
    next: () => { this.serverErrors.set({}); /* salva */ },
    error: (err) => this.serverErrors.set(err.fieldErrors),
  });
}
cancelForm(): void {
  this.serverErrors.set({});
  this.showForm.set(false);
}

// Nella form config
{ type: FieldType.Section,  field: '_s_anagrafica', label: 'fields.section.anagrafica' },
{ type: FieldType.Input,    field: 'nome',          label: 'fields.nome.label' },
{ type: FieldType.Textarea, field: 'note',          label: '...', colSpan: 2 }
{ type: FieldType.Array,    field: 'contatti',      label: '...', colSpan: 2 }
// Layout Bootstrap-like con columns=12: campo centrato (colonne 3–7, 5 slot)
{ type: FieldType.Input, field: 'codice', label: '...', colStart: 3, colSpan: 5 }
```

### Form Dialog (`src/app/builder/components/form-dialog/`)

File: `form-dialog.component.{ts,html,scss}`

`FormDialogComponent` — wrapper Kendo dialog con `ng-content`. Solo per dialog (nessuna modalità inline).

```html
<app-form-dialog [open]="show()" title="Titolo" formId="my-form" submitLabel="Salva" (cancel)="onCancel()">
  <app-form-renderer formId="my-form" [config]="config" [form]="form" (formSubmit)="onSubmit($event)" />
</app-form-dialog>
```

Input: `open`, `title`, `formId`, `submitLabel`, `width`. Output: `cancel`. Il `formId` va passato identico a dialog e renderer per collegare il pulsante submit al `<form>`.

- **`width`** — larghezza della dialog in px (default `580`). `minWidth` è fisso a `320`. Aumentare per form a più colonne:
  ```html
  <app-form-dialog [width]="860" ...>
    <app-form-renderer [columns]="2" ... />
  </app-form-dialog>
  ```

- `title` e `submitLabel` sono stringhe plain (non chiavi Transloco) — il parent è responsabile di passare il testo già localizzato.
- Solo `form.cancel` (bottone Annulla) è tradotto internamente con `| transloco`.

### Grid Renderer (`src/app/builder/components/grid-renderer/`)

File: `grid-renderer.component.{ts,html,scss}`

Il componente è **stateless** e **generico**: `GridRendererComponent<T extends Record<string, unknown>>`. Il parent possiede lo stato e fornisce i dati già processati.

**`TypedGridResult<T>`** — tipo esportato: `{ data: T[]; total: number }`. Wrapper tipizzato di `GridDataResult` di Kendo (che usa `any[]`). Permette agli output `editClick`/`deleteClick`/`selectionChange` di emettere `T` invece di `unknown`.

**Input/Output:**
| | Tipo | Scopo |
|-|------|-------|
| `data` | `TypedGridResult<T>` | Dati già processati (sort/page/filter) dal parent |
| `state` | `State` | Stato corrente (sort, paginazione, filtri Kendo) |
| `columns` | `GridColumnConfig[]` | Configurazione colonne |
| `editable` | `boolean` | Modalità edit (default `false`) |
| `stateChange` | `output<State>` | Emesso quando sort/page/filtro cambiano |
| `selectionChange` | `output<T[]>` | Righe selezionate (tipizzato) |
| `createClick` / `editClick` / `deleteClick` | `output<void>` / `output<T>` / `output<T>` | Azioni CRUD (tipizzato) |

**Pattern di utilizzo nel parent:**
```typescript
readonly gridState = signal<State>({ skip: 0, take: 5, filter: { filters: [], logic: 'and' } });
readonly gridData  = computed<TypedGridResult<MyView>>(() =>
  process(this.data().map(toView) as unknown as Record<string, unknown>[], this.gridState()) as TypedGridResult<MyView>,
);
onGridStateChange(state: State): void { this.gridState.set(state); }
onEditClick(item: MyView): void { ... }       // nessun cast necessario
onSelectionChange(items: MyView[]): void { ... }
```
```html
<app-grid-renderer [data]="gridData()" [state]="gridState()"
  (stateChange)="onGridStateChange($event)"
  (editClick)="onEditClick($event)"
  (selectionChange)="onSelectionChange($event)" />
```

Angular inferisce `T = MyView` dal tipo di `gridData()`. In modalità server-side, `onGridStateChange` aggiorna `gridState` e chiama il server — i filtri sono già remappati secondo `filterField`.

**Rendering celle e filtri — template decoupled:**
Ogni `kendo-grid-column` usa un `kendoGridCellTemplate` indipendente dal `kendoGridFilterCellTemplate`. I due template coesistono nella stessa colonna senza influenzarsi.

- **Cell template** (priorità decrescente):
  1. `displayFn` → `{{ col.displayFn!(dataItem[col.field]) }}` — formatter custom; ha precedenza su tutto
  2. `filter === 'combobox'` o `display === 'option'` → `labelForValue()`
  3. `display === 'boolean'` → `<input type="checkbox" disabled>`
  4. else → Kendo default (testo, numero, data formattata via `[format]`)

- **Filter template** (solo se c'è un editor custom):
  - `filter === 'combobox'` → `kendo-combobox` con `getFilterOptions(col)`
  - `filter === 'date'` → `kendo-datepicker` con `[format]="'dd/MM/yyyy'"` — evita il formato americano del browser
  - `filter === 'time'` → `kendo-timepicker`
  - tutti gli altri tipi → editor built-in di Kendo (nessun template custom)

- **`columnFilterType(col)`** — mappa il tipo da passare a `[filter]` di `kendo-grid-column`:
  `'combobox'`, `'time'`, `'date'` → `'text'` (evita che Kendo mostri anche l'editor built-in oltre al custom); `display === 'boolean'` → `'boolean'`; altrimenti passthrough.

**Filtri:**
- Inline (`[filterable]="'row'"`), non menu.
- **`resolvedFilterOptions`** — `toSignal` su `toObservable(columns)` + `switchMap` + `combineLatest`: risolve `GridOptionsLoader` (statico, Observable, factory) per ogni colonna combobox; memorizzato in `Map<string, FieldOption[]>`; aggiornato reattivamente al cambio colonne.
- **`getFilterOptions(col)`** — legge da `resolvedFilterOptions().get(col.field) ?? []`; usato nel template `[data]="getFilterOptions(col)"`.
- **Filtro combobox singolo** (`FieldOption | null`): `applyComboFilter` costruisce sempre il filtro con dot notation `field.value` e passa tutto a `onStateChange`. `onStateChange` applica `remapFilterFields()` prima di emettere — sostituisce `field.value` con `filterField` per le colonne che lo dichiarano. `comboFilterValue` legge dallo stato usando `filterField ?? field.value` (lo stato memorizzato dal parent è già remappato).
- **Filtro combobox array** (`FieldOption[]`, `filterOperator: 'contains'`): gestito internamente via `_arrayFilters` — `arr.some(o => o.value === filterValue)` applicato su `data().data`. Kendo Data Query non supporta filtri su array di oggetti.
- **Filtro time** (`filter: 'time'`): gestito internamente via `_timeFilters = signal(Map<string, { value: Date; operator: string }>)`. `timeToMs()` converte sia `Date` che `string "HH:mm:ss"` in millisecondi, permettendo il filtro su colonne con valori stringa senza ViewModel. `compareTime` confronta solo ore/minuti/secondi. Operatore configurabile via `filterOperator` (default `'eq'`).
- **`labelForValue(value)`** — legge `.label` dall'oggetto `FieldOption` o mappa `FieldOption[]` in stringa unita da `', '`.
- **`columnFormat(col)`** — normalizza il formato per `[format]` di `kendo-grid-column`: se il formato non inizia con `{0:`, aggiunge il wrapper automaticamente. Accetta `'HH:mm:ss'` e `'{0:HH:mm:ss}'` indifferentemente. Default per `filter: 'time'`: `'HH:mm:ss'`.

**Selezione:**
- `editable=true` → selezione singola cliccando la riga; `selectionChange` emette array con 0 o 1 elemento.
- `editable=false` → `kendo-grid-checkbox-column` con `showSelectAll`; selezione multipla; `selectionChange` emette array con N elementi.

### Internazionalizzazione (`@jsverse/transloco`)

- **Loader**: `src/app/transloco-loader.ts` — `TranslocoHttpLoader` carica `/i18n/{lang}.json` via `HttpClient`
- **Provider**: `provideTransloco({ config: { availableLangs: ['it','en'], defaultLang: 'it', reRenderOnLangChange: true }, loader: TranslocoHttpLoader })` in `app.config.ts`
- **File traduzioni**: `public/i18n/it.json` e `public/i18n/en.json` — struttura:
  ```
  grid.*          UI chrome griglia (bottoni, dialog, placeholder filtro)
  form.*          UI chrome form dialog (bottone annulla)
  errors.*        Messaggi errori validazione con parametri ({{ min }}, {{ max }})
  fields.**       Label e placeholder dei campi form (struttura annidata; es. fields.contatti.nome.label)
  columns.*       Titoli colonne griglia
  select.*        Testi helper select (es. select.choose per defaultItem)
  ```
- **Field component** — approccio pipe:
  - Importano `TranslocoPipe`; usano `| transloco` direttamente nel template per `label`, `placeholder`, errori
  - `config().label` e `config().placeholder` in `FormFieldConfig` sono chiavi di traduzione
  - Template: `[text]="config().label | transloco"`, `[placeholder]="(config().placeholder ?? '') | transloco"`
  - Errori: `readonly errorInfo = computed(() => firstErrorInfo(this.state().errors()))` → template: `{{ errorInfo().key | transloco: errorInfo().params }}`
  - **Eccezione `select-field`**: il `defaultItem.label` è una stringa dentro un oggetto Kendo, non può essere tradotta con la pipe. Solo `select-field` inietta anche `TranslocoService` — esclusivamente per `defaultItem = computed(() => ({ label: this.transloco.translate(config().placeholder ?? 'select.choose'), value: null }))`.
- **Grid/FormDialog**: importano `TranslocoPipe`; usano `| transloco` su tutti i testi UI (bottoni, dialog, titoli colonne, placeholder filtri).
- **Language switcher**: `AppComponent` espone `activeLang = toSignal(transloco.langChanges$)` e `setLang(lang)` → `transloco.setActiveLang(lang)`.

### Utils

- `src/app/builder/utils/field-error.ts` — `firstErrorInfo(errors: readonly ValidationError[]): ErrorInfo`
  Interfaccia: `ErrorInfo { key: string; params?: Record<string, unknown> }`.
  Se `error.message` è presente restituisce `{ key: error.message }` (Transloco lo restituisce as-is se non trova la chiave).
  Per errori standard restituisce `{ key: 'errors.required' }` / `{ key: 'errors.minLength', params: { min } }` ecc.
  I parametri sono estratti con cast `(error as ValidationError & Record<string, unknown>)['minLength']`.

## Pattern di utilizzo

### Create mode

```typescript
const EMPTY: MyForm = { nome: '', email: '', tipo: null, ... };
readonly model = signal<MyForm>(EMPTY);
readonly form  = this.engine.buildForm(this.model, this.formConfig);
```

### Edit mode

```typescript
// Dopo la chiamata HTTP — stesso form, stesso FieldTree.
// I campi combobox/select arrivano già come FieldOption dal server.
this.http.get<MyForm>('/api/entity/1').subscribe(data => this.model.set(data));
```

`form` e `FieldTree` non cambiano — è solo il model signal a essere aggiornato.

### Date come stringhe

`DateFieldComponent` accetta sia `Date` che `string` nel modello. La conversione avviene internamente — nessun ViewModel necessario per i campi data con valori stringa.

**Formati di default per tipo:**

| FieldType | Formato Luxon | Esempio |
|-----------|--------------|---------|
| `Date` | `'yyyy-MM-dd'` | `"2026-12-31"` |
| `DateTime` | `"yyyy-MM-dd'T'HH:mm:ss"` | `"2026-06-08T14:30:00"` |
| `Time` | `'HH:mm:ss'` | `"08:30:00"` (ASP.NET TimeOnly) |

**Comportamento:**
- Valore `string` → parsato con Luxon → `Date` per il picker Kendo
- Valore `Date` → usato direttamente
- `onValueChange`: se il valore corrente nel modello era `string` → scrive indietro come `string` (stesso formato); altrimenti scrive `Date`
- Valore `null` → picker vuoto; se l'utente sceglie → scrive `Date` (non stringa, perché da `null` non si conosce il formato desiderato)

```typescript
// Nel domain model — nessun ViewModel necessario
interface MyForm {
  scadenza:      string | null;  // "yyyy-MM-dd"
  ultimoAccesso: string | null;  // "yyyy-MM-dd'T'HH:mm:ss"
  oraStart:      string | null;  // "HH:mm:ss" — ASP.NET TimeOnly
}

// Nella form config — il componente gestisce la conversione
{ type: FieldType.Date,     field: 'scadenza',      label: '...' }
{ type: FieldType.DateTime, field: 'ultimoAccesso', label: '...' }
{ type: FieldType.Time,     field: 'oraStart',      label: '...' }
```

**In griglia**: usare sempre `displayFn` per formattare i valori stringa — `[format]` di Kendo non opera su `string`, solo su `Date`/`number`.

```typescript
// Visualizzazione stringa ISO come data localizzata
{ field: 'scadenza', filter: 'text', filterable: false,
  displayFn: v => v ? DateTime.fromISO(v as string).toFormat('dd/MM/yyyy') : '' }

// Visualizzazione stringa "HH:mm:ss" con filtro timepicker (supporto nativo per string)
{ field: 'oraInizio', filter: 'time', filterable: true,
  displayFn: v => v ? (v as string).substring(0, 5) : '' }
```

- `filter: 'text'` / `filterable: false` → per campi date/datetime come stringa senza filtro interattivo
- `filter: 'time'` → accetta sia `Date` che `string "HH:mm:ss"` nel filtro interno (`timeToMs` gestisce entrambi)
- `filter: 'date'` → richiede oggetti `Date`; se il campo è stringa, convertire nel ViewModel

### ViewModel — tipi dominio vs tipi form

Necessario quando il dominio ha tipi incompatibili non gestibili automaticamente dal componente: `number` per un campo Select, o quando la griglia deve filtrare le date con il date-picker Kendo.

**Esempio: `weekday: number` (dominio)**

```typescript
/** Modello dominio */
interface PersonForm {
  weekday: number | null;   // 0–6
}

/** Modello form/display */
type PersonFormView = Omit<PersonForm, 'weekday'> & {
  weekday: FieldOption | null;  // Select richiede FieldOption
};

// Conversione bidirezionale — static per evitare dipendenze da injection
private static toView(p: PersonForm, weekdays: FieldOption[]): PersonFormView {
  return { ...p, weekday: weekdays.find(d => d.value === p.weekday) ?? null };
}

private static fromView(v: PersonFormView): PersonForm {
  return { ...v, weekday: (v.weekday?.value as number) ?? null };
}
```

**Wiring nel componente:**

```typescript
readonly weekdays  = computed(() => weekdaysForLocale(this.activeLang()));
readonly people    = signal<PersonForm[]>(SAMPLE_PEOPLE);
readonly formModel = signal<PersonFormView>(AppComponent.toView(EMPTY, []));

readonly form = this.engine.buildForm(this.formModel, this.formConfig, ...);

// gridData dipende da weekdays() per aggiornare le label al cambio lingua
readonly gridData = computed<TypedGridResult<PersonFormView>>(() => {
  const wd = this.weekdays();
  return process(
    this.people().map(p => AppComponent.toView(p, wd)) as unknown as Record<string, unknown>[],
    this.gridState(),
  ) as TypedGridResult<PersonFormView>;
});

onEditClick(item: PersonFormView): void { this.formModel.set(item); }  // nessun cast
onSelectionChange(items: PersonFormView[]): void { ... }               // nessun cast

onFormSubmit(payload: Record<string, unknown>): void {
  const person = AppComponent.fromView(payload as unknown as PersonFormView);
}
```

> Il signal si chiama `formModel` (non `model`) per evidenziare che è il modello view, non il dominio.

### Localizzazione giorni della settimana

I nomi dei giorni si generano con Luxon `Info.weekdays()` — mai array statici in italiano.

```typescript
import { Info } from 'luxon';

function weekdaysForLocale(locale: string): FieldOption[] {
  return Info.weekdays('long', { locale }).map((label, i) => ({
    value: i,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));
}

// Nel componente — signal reattivo al cambio lingua
readonly weekdays = computed(() => weekdaysForLocale(this.activeLang()));

// Form config — opzioni Observable che reagiscono al cambio lingua
{
  type: FieldType.Select, field: 'weekday', label: '...',
  options: this.transloco.langChanges$.pipe(
    startWith(this.transloco.getActiveLang()), map(weekdaysForLocale)
  ),
}

// Grid config — stesso Observable per il filtro
{
  field: 'weekday', filter: 'combobox',
  filterOptions: this.transloco.langChanges$.pipe(
    startWith(this.transloco.getActiveLang()), map(weekdaysForLocale)
  ),
}
```

`Info.weekdays('long', { locale })` restituisce i nomi da Lunedì (indice 0) a Domenica (indice 6) — allineato al dominio `weekday: 0–6`.

### Options a cascata

```typescript
{
  type: FieldType.Combobox, field: 'citta', label: 'Città',
  options: (state) => {
    const regione = (state['regione'] as FieldOption | null)?.value;
    return regione ? this.loader.loadOptions('/comuni', { regione }) : of([]);
  },
}
```

La lambda riceve i valori correnti del form e viene chiamata dentro `runInInjectionContext` — si può usare qualsiasi servizio Angular. Si ricalcola reattivamente quando cambiano i valori di stato.

### Validatori custom

Tutti i tipi di validatore convivono nella stessa prop `validators: AnyValidator[]`. `FormEngineService` li discrimina a runtime: `typeof v === 'function'` → custom sync, `'validate' in v` → async, altrimenti builtin standard.

```typescript
validators: [
  // Standard (ValidatorConfig)
  { type: ValidatorType.Required },
  { type: ValidatorType.MinLength, value: 2 },

  // Sincrono custom (CustomValidatorFn)
  (value) => value === 'vietato' ? { kind: 'forbidden', message: '...' } : null,

  // Asincrono (AsyncValidatorConfig, Promise-based, debounce configurabile)
  { debounce: 500, validate: async (value) => { ... } },
]

// Cross-field — form-level (FormBuildOptions.validators, rimane separato)
this.engine.buildForm(this.model, this.formConfig, {
  validators: [(values) => values.password !== values.confirm
    ? { kind: 'mismatch', message: 'Le password non corrispondono' }
    : null]
})
```

**`DynamicFieldConfig`** — restringe `validators` a soli `ValidatorConfig[]` (JSON-serializzabile): le lambda non viaggiano in JSON.

**`AnyValidator`** — tipo esportato da `form-field-config.ts`:
```typescript
type AnyValidator = ValidatorConfig | CustomValidatorFn | AsyncValidatorConfig;
```
```

## Pattern di design

- **`resolveOptions()` helper** nei componenti select/combobox: normalizza `FieldOption[] | Observable<FieldOption[]>` → `Observable<FieldOption[]>`
- **`resolvedOptionsObs` computed** in select/combobox: gestisce i tre formati di `options` (array, Observable, lambda); chiama `runInInjectionContext` per la lambda; alimenta `toSignal(toObservable(...).pipe(switchMap(...)))`.
- **`FieldTree<T>` come funzione callable**: `fieldTree()` → `FieldState<T>`; `fieldTree[key]` → `FieldTree<T[key]>`
- **Circular dependency array**: `RowRendererComponent` e `ArrayFieldComponent` definiti nello stesso `.ts` (`array-field.component.ts`), `RowRendererComponent` prima. Template e stili sono in file separati (`row-renderer.component.{html,scss}` e `array-field.component.{html,scss}`) — ogni classe usa il proprio `templateUrl`/`styleUrl`.
- **Field initializer in `AppComponent`**: `model`, `formConfig` e `form` inizializzati come class field per garantire la disponibilità al primo render
- **`FieldTree<any>` non assegnabile via template**: usare `input.required<unknown>()` nel renderer e castare internamente; evitare `FieldTree<any>` come tipo di input Angular (il conditional type risolve `CompatFieldState` per `any`)
- **`NG01902 Orphan field`**: `FieldTree` è probabilmente un Proxy; ogni accesso `(form as any)[fieldName]` restituisce un oggetto diverso. Due `FieldTree` per lo stesso campo → due `FieldState` → il primo diventa "orphan" alla prima scrittura. Fix: `fieldTreeCache = computed(...)` nel renderer, calcolato una volta per campo (vedi `form-renderer.component.ts`). Lo stesso pattern vale per item di array in `ArrayFieldComponent`.
- **`untracked()` su `formTree[fieldName]` nel cache**: il Proxy di FieldTree legge il model signal come side effect quando si accede a `formTree[fieldName]`. Se l'accesso avviene dentro un `computed()`, il model diventa una dipendenza della cache → ogni `value.set(...)` (es. svuotare la combobox) invalida la cache → il Proxy può restituire `undefined` durante la transizione → `fieldFor(...) is not a function`. Fix: `untracked(() => formTree[f.field])` — taglia la dipendenza dal model, la cache si ricalcola solo se `form` o `config` cambiano.
- **`NG01902` da `undefined` nel modello**: Angular Signal Forms vieta `undefined` nei valori. Kendo ComboBox emette `undefined` quando si deseleziona. Fix: `value ?? null` in `onValueChange` prima di chiamare `state().value.set(value)`.
- **Kendo ComboBox — external vs internal filter mode**:
  - **External filter** (`filterable=true` + `(filterChange)` bound): Kendo delega il filtering al developer. Obbligatorio per `searchFn`. Richiede `(open)="onOpen()"` + `_openCount = signal(0)` letto in `displayData` per forzare il recompute ad ogni apertura.
  - **Internal filter** (`filterable=true` senza `(filterChange)`): Kendo filtra autonomamente da `[data]` — nessun "No data found". Corretto per opzioni statiche (senza `searchFn`).
  - **Regola**: usare `@if (config().searchFn)` per differenziare i due casi.
- **Edit mode combobox con `searchFn`**: `displayData` include il valore corrente (`state().value()`) quando non c'è termine di ricerca e il valore non è già in `baseOptions`. Nessuna chiamata HTTP — il valore è già un `FieldOption` completo.
- **`No data found` alla prima apertura**: `_openCount = signal(0)` incrementato in `onOpen()` e letto in `displayData` come dipendenza reattiva che forza il recompute.
- **`baseOptions` sincrono per array statici**: check `Array.isArray(opts)` per lettura sincrona (evita flash); Observable e lambda usano `asyncBaseOptions` via `toSignal`.
- **`resource()` in schema function**: richiede injection context; usare `runInInjectionContext(this.injector, () => resource(...))` dentro `validateAsync.factory`
- **`inputsCache` in renderer**: gli oggetti `inputs` per `NgComponentOutlet` vanno cached; se ricreati ad ogni CD, `setInput()` viene chiamato inutilmente. `formValues` è il riferimento al signal (stabile), non il suo valore — non invalida la cache.
- **`formValues` solo a Select e Combobox**: `inputsCache` include `formValues` solo per `FieldType.Select` e `FieldType.Combobox`; gli altri field component non lo dichiarano e Angular lancerebbe `NG0303`.
- **`validate(path, () => null)` no-op obbligatorio**: Angular Signal Forms crea il nodo FieldTree **solo** per i campi su cui viene chiamata almeno una funzione di schema. Per campi senza validator né `visibleWhen`, `form[fieldName]` restituisce `undefined` → runtime error. Fix in `FormEngineService.applyFieldSchema`: aggiungere `validate(path, () => null)` come prima riga per ogni campo.
- **Grid stateless — stato nel parent**: `GridRendererComponent` non gestisce stato internamente. Il parent possiede `gridState = signal<State>(...)`, calcola `gridData = computed<TypedGridResult<T>>(() => process(...) as TypedGridResult<T>)` e aggiorna lo stato in `onGridStateChange(s) { gridState.set(s) }`. Questo segue il pattern Kendo server-side binding e permette al parent di intercettare ogni cambio di paginazione/ordinamento/filtro.
- **`TypedGridResult<T>` — inferenza del tipo**: Angular inferisce `T` dal tipo di `gridData()`. Se `gridData` è `TypedGridResult<PersonFormView>`, gli handler `(editClick)="fn($event)"` ricevono `PersonFormView` senza cast. Il doppio cast `process(...) as TypedGridResult<T>` è necessario perché `process()` restituisce `GridDataResult` con `any[]`.
- **`_arrayFilters` e `_timeFilters` interni vs `stateChange`**: I filtri su colonne `FieldOption[]` (`filterOperator: 'contains'`) e su colonne `filter: 'time'` non possono essere delegati a Kendo Data Query (`process()` non supporta `Array.some()` né il confronto solo-orario). Rimangono interni al componente, applicati su `data().data` dopo che il parent ha già processato. I filtri Kendo standard vengono emessi via `stateChange` → il parent riesegue `process()`.
- **`filterField` su `GridColumnConfig`**: se impostato, `onStateChange` sostituisce `field.value` con `filterField` nel filtro prima di emettere `stateChange`. Il remap è centralizzato in `remapFilterFields()` dentro `onStateChange` — `applyComboFilter` usa sempre dot notation internamente. In modalità locale (senza `filterField`) la dot notation rimane e `process()` funziona correttamente. Esempio: `{ field: 'regione', filter: 'combobox', filterOptions: regioni$, filterField: 'regioneId' }` → `stateChange` emette `{ field: 'regioneId', operator: 'eq', value: 'Veneto' }`.
- **Cast `as unknown as Record<string, unknown>[]`**: TypeScript non permette il cast diretto da un tipo concreto (es. `PersonForm[]`) a `Record<string, unknown>[]` quando il tipo non ha index signature. Serve il doppio cast: `this.people() as unknown as Record<string, unknown>[]` prima di passare l'array a `process()`.
- **`OptionsLoader` usa `Record<string, unknown>` non `State`**: il parametro della lambda riceve i valori correnti del form (da `formValuesSignal`), non lo stato Kendo della griglia. Importare `State` da `@progress/kendo-data-query` per `OptionsLoader` è semanticamente sbagliato.
- **Transloco — pipe nel template, non computed**: i field component usano `TranslocoPipe` con `| transloco` nel template. Non usare `TranslocoService.translate()` in `computed()` (es. `tLabel`, `tPlaceholder`) — questi computed non reagiscono al cambio lingua perché `translate()` è sincrono e non è un signal. L'unica eccezione è `select-field` per `defaultItem.label` (stringa dentro oggetto Kendo, impossibile usare la pipe).
- **Transloco — `error.message` non è una chiave**: i validatori custom con `message` forniscono testo già leggibile (non una chiave). `firstErrorInfo` restituisce `{ key: error.message }` — Transloco non trova la chiave e restituisce la stringa as-is. Solo gli errori standard (`required`, `email`, `minLength`, ecc.) usano chiavi `errors.*`.
- **Transloco — `fields.contatti.*` struttura annidata**: i campi array usano chiavi annidate come `fields.contatti.nome.label`. Nel JSON questo corrisponde a `{ "fields": { "contatti": { "nome": { "label": "..." } } } }`. Usare chiavi piatte con punto (`"contatti.nome"`) rompe la risoluzione Transloco perché il dot separator è riservato alla navigazione della struttura.
- **`array-field` — label non tradotta**: `ArrayFieldComponent` renderizza `{{ config().label }}` as-is senza `| transloco`. Se si usa Transloco, il valore deve essere pre-tradotto dal parent o si deve aggiungere `TranslocoPipe` al componente.
- **`RowRendererComponent` — nessun `formValues`**: i field Select/Combobox dentro un array non ricevono `formValues`; le opzioni a cascata (lambda `(state) => …`) non funzionano all'interno di `arrayConfig`. Solo le opzioni statiche e Observable sono supportate negli array.
- **Config form e grid separate**: `formConfig: FormFieldConfig[]` e `gridColumns: GridColumnConfig[]` sono array indipendenti. Non esiste un metodo `buildGridColumns` — la griglia ha la propria configurazione esplicita. Questo evita coupling tra le due interfacce (form e grid possono essere usate indipendentemente).
- **`serializeValue` esclude solo `hidden()`**: i campi con `showInForm: false` vengono comunque inclusi nel payload serializzato (es. `id`). L'esclusione dal render è responsabilità del renderer (`field.showInForm !== false`), non del serializzatore.
- **`FieldType.Section` — skip in engine e renderer**: `applyFieldSchema` filtra `f.type !== FieldType.Section` prima di chiamare `validate()`; `fieldTreeCache`, `inputsCache` e `disabledSignals` fanno lo stesso. Nel template il renderer usa un branch separato `@if (field.type === FieldType.Section)` che non chiama `fieldFor()`. Il registry `FIELD_COMPONENTS` è `Partial<Record<...>>` — Section non ha entry e non viene mai usata con `NgComponentOutlet`.
- **`serverErrors` — pattern con signal**: il parent dichiara `readonly serverErrors = signal<Record<string, string>>({})`, lo passa via `[serverErrors]="serverErrors()"`. Ogni field component riceve `serverError: string | null` via `inputsCache` e lo controlla in `showError` e `errorInfo`. Azzerare sempre al submit riuscito e al cancel: `this.serverErrors.set({})`. Il cambio di `serverErrors` invalida `inputsCache` (che lo legge in computed) → Angular chiama `setInput('serverError', ...)` su ogni field.
- **Layout errori stabile — `.form-error-host`**: ogni field HTML avvolge `@if (showError())` in `<div class="form-error-host">` con `min-height: 1.5em` nel SCSS del componente. Lo spazio è sempre riservato, `kendo-formerror` appare/scompare al suo interno senza spostare i campi adiacenti.
- **ViewModel — quando usarlo**: obbligatorio solo quando il dominio ha tipi non gestibili dal componente: `number` → `FieldOption | null` per Select; `Date` nella grid con filtro date-picker Kendo. Non serve per stringhe ISO date/datetime/time — `DateFieldComponent` le gestisce direttamente. Creare `type FooView = Omit<Foo, 'campo1'|'campo2'> & { campo1: TipoForm1; campo2: TipoForm2 }` con `toView/fromView` static. Il signal passato a `buildForm` si chiama `formModel`.
- **`gridData` e ViewModel**: quando si usa un ViewModel, `gridData` mappa i dati dominio attraverso `toView` prima di `process()`. La grid chiama `labelForValue()` sui valori — che devono essere `FieldOption`, non primitivi. Dipendenze reattive (es. `weekdays()`) vanno lette dentro il `computed` di `gridData` affinché la griglia si aggiorni al cambio lingua.
- **Luxon — API usata**: `import { DateTime, Info } from 'luxon'`. `DateTime.fromFormat(s, fmt).toJSDate()` per parsare; `DateTime.fromJSDate(d).toFormat(fmt)` per serializzare. `DateTime.fromISO(s)` per stringhe ISO. `Info.weekdays('long', { locale })` per nomi giorni localizzati (array Lun–Dom). Usare sempre formati espliciti per ASP.NET TimeOnly (`'HH:mm:ss'`).
- **Formato display picker — `displayFormat()` in `DateFieldComponent`**: i Kendo date picker ignorano `LOCALE_ID` di Angular e usano la locale del browser (default en-US → MM/dd/yyyy). Il formato è fissato via `[format]="displayFormat()"` su tutti i picker. Default per tipo: `'dd/MM/yyyy'` (`Date`), `'dd/MM/yyyy HH:mm'` (`DateTime`), `'HH:mm'` (`Time`). Sovrascrivibile campo per campo con `format` in `FormFieldConfig` (es. `format: 'dd/MM/yyyy HH:mm:ss'` per mostrare i secondi). Per renderlo reattivo alla lingua, fare leggere la locale corrente in `displayFormat()`.
- **Date come stringhe in `DateFieldComponent`**: il componente rileva automaticamente se il valore è `string` e lo parsa con Luxon (formato di default per tipo: `'yyyy-MM-dd'`, `"yyyy-MM-dd'T'HH:mm:ss"`, `'HH:mm:ss'`). Alla scrittura, se il valore corrente era stringa, scrive indietro stringa. Valore `null` → scrive `Date` (formato sconosciuto). Per grid con filtro date-picker Kendo su questi campi, convertire nel ViewModel.
- **`displayFn` universale in `GridRendererComponent`**: ha la precedenza assoluta nel cell template, indipendentemente da `filter`, `display` e `format`. È il modo corretto per formattare valori che Kendo non può formattare via `[format]` (stringhe, oggetti custom). Template decoupled: `displayFn` controlla solo la cella — il filter template resta indipendente.
- **`columnFormat(col)` in `GridRendererComponent`**: normalizza il formato per `[format]` di `kendo-grid-column`. Accetta `'HH:mm:ss'` o `'{0:HH:mm:ss}'` indifferentemente; aggiunge `{0:…}` se assente. Default per `filter: 'time'`: `'HH:mm:ss'`. Applicato solo quando non c'è `displayFn` — le due opzioni sono alternative.
