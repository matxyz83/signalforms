import { Observable } from 'rxjs';

export enum FieldType {
  Input    = 'input',
  Select   = 'select',
  Combobox = 'combobox',
  Checkbox = 'checkbox',
  Textarea = 'textarea',
  Array    = 'array',
  Date     = 'date',
  DateTime = 'datetime',
  Time     = 'time',
  Lookup   = 'lookup',
}

export enum ValidatorType {
  Required  = 'required',
  MinLength = 'minLength',
  MaxLength = 'maxLength',
  Min       = 'min',
  Max       = 'max',
  Pattern   = 'pattern',
  Email     = 'email',
}

export interface ValidatorConfig {
  type: ValidatorType;
  value?: string | number;
  /** Sovrascrive il messaggio di errore di default */
  message?: string;
}

export interface FieldOption {
  value: unknown;
  label: string;
  disabled?: boolean;
}

export type CustomValidatorFn = (value: unknown) =>
  | { kind: string; message?: string }
  | null | undefined | void;

export interface AsyncValidatorConfig {
  validate: (value: unknown) => Promise<{ kind: string; message?: string } | null>;
  /** Debounce in ms prima di avviare la chiamata async (default 300) */
  debounce?: number;
}

/** Opzioni form-level passate a FormEngineService.buildForm() */
export interface FormBuildOptions<T> {
  /** Validatori sincroni cross-field (operano sull'intero valore del form) */
  validators?: Array<
    (values: T) =>
      | { kind: string; message?: string }
      | { kind: string; message?: string }[]
      | null | undefined | void
  >;
}

export type InputType =
  | 'text' | 'email' | 'number' | 'tel'
  | 'url'  | 'password' | 'search' | 'color';

/**
 * Opzioni per il filtro combobox della grid: array statico, Observable, o factory function.
 * A differenza di OptionsLoader non riceve lo stato del form.
 */
export type GridOptionsLoader =
  | FieldOption[]
  | Observable<FieldOption[]>
  | (() => Observable<FieldOption[]>);

export interface GridColumnConfig {
  field: string;
  title: string;
  width?: number;
  filterable?: boolean;
  sortable?: boolean;
  /** `'combobox'` abilita il filtro a selezione con kendo-combobox (richiede filterOptions). `'time'` usa kendo-timepicker confrontando solo ore/minuti/secondi. */
  filter?: 'text' | 'numeric' | 'date' | 'boolean' | 'combobox' | 'time';
  /** Formato Kendo per la cella (es. '{0:d}' per date, '{0:n2}' per numeri) */
  format?: string;
  /** Opzioni per il filtro combobox: statiche, Observable, o factory */
  filterOptions?: GridOptionsLoader;
  /** Operatore di filtro (default: 'eq'; usare 'contains' per campi array come interessi) */
  filterOperator?: string;
  /**
   * Campo da usare nel filtro emesso via `serverStateChange` al posto di `field.value`.
   * Necessario quando il server si aspetta un nome diverso (es. `regioneId` invece di `regione.value`).
   */
  filterField?: string;
  /**
   * Modalità di rendering della cella.
   * `'option'` → usa labelForValue() (dati FieldOption senza filtro combobox).
   * `'boolean'` → checkbox readonly.
   * `'text'` → default Kendo (omettibile).
   */
  display?: 'text' | 'option' | 'boolean';
  /**
   * Formatter personalizzato per la cella.
   * Ha la precedenza su `display` e sul rendering nativo di Kendo.
   * Applicabile a qualsiasi tipo di colonna (`filter: 'combobox'`, `'date'`, `'time'`, ecc.).
   * Esempio: `displayFn: (v) => v ? DateTime.fromISO(v as string).toFormat('dd/MM/yyyy') : ''`
   */
  displayFn?: (value: unknown) => string;
}

export type OptionsLoader = FieldOption[] | Observable<FieldOption[]> | ((state: Record<string, unknown>) => FieldOption[] | Observable<FieldOption[]>);

/** Colonna mostrata nella griglia di risultati della dialog di lookup. */
export interface LookupColumnConfig {
  field: string;
  /** Chiave Transloco per l'intestazione colonna */
  title: string;
  width?: number;
}

/**
 * Configurazione per il campo Lookup.
 * La dialog apre una mini-griglia con ricerca server-side.
 * Il valore selezionato viene memorizzato come FieldOption (value + label).
 */
export interface LookupConfig {
  /** Chiave Transloco per il titolo della dialog (default: 'lookup.title') */
  title?: string;
  /** Chiave Transloco per il placeholder della casella di ricerca (default: 'lookup.searchPlaceholder') */
  searchPlaceholder?: string;
  /** Numero minimo di caratteri prima di avviare la ricerca (default: 1) */
  minSearchLength?: number;
  /** Campo del risultato che diventa FieldOption.value (es. 'id') */
  valueField: string;
  /** Campo del risultato che diventa FieldOption.label (es. 'ragioneSociale') */
  labelField: string;
  /** Funzione di ricerca: riceve il termine e restituisce un Observable di righe */
  searchFn: (term: string) => Observable<Record<string, unknown>[]>;
  /** Colonne mostrate nella griglia di risultati */
  columns: LookupColumnConfig[];
}

/**
 * Regola di visibilità dichiarativa — serializzabile in JSON.
 * Usata in DynamicFieldConfig al posto della lambda `visibleWhen`.
 * DynamicFormService.toFormConfig() la converte nella lambda attesa da FormEngineService.
 */
export interface DynamicVisibilityRule {
  /** Campo del form da osservare */
  field: string;
  /** Operatore di confronto */
  operator: 'eq' | 'neq' | 'truthy' | 'falsy';
  /**
   * Valore da confrontare (per 'eq' e 'neq').
   * Per campi Select/Combobox viene confrontato con il `.value` dell'opzione selezionata.
   */
  value?: unknown;
}

/**
 * Sottoinsieme JSON-serializzabile di FormFieldConfig.
 * Usato per campi dinamici che provengono da API/DB.
 *
 * Esclude i campi non serializzabili:
 * - `options` come Observable o lambda → solo `FieldOption[]` statico
 * - `searchFn`, `visibleWhen`, `customValidators`, `asyncValidators` → sostituiti da versioni dichiarative
 * - `arrayConfig` → non supportato nei campi dinamici
 */
export type DynamicFieldConfig = Omit<
  FormFieldConfig,
  'options' | 'searchFn' | 'visibleWhen' | 'customValidators' | 'asyncValidators' | 'arrayConfig' | 'lookupConfig'
> & {
  /** Solo array statico di opzioni — Observable e lambda non sono serializzabili in JSON */
  options?: FieldOption[];
  /** Visibilità dichiarativa — convertita in funzione da DynamicFormService.toFormConfig() */
  visibleWhen?: DynamicVisibilityRule;
};

/**
 * Sottoinsieme JSON-serializzabile di GridColumnConfig.
 * Usato per colonne dinamiche che provengono da API/DB.
 *
 * Esclude i campi non serializzabili:
 * - `filterOptions` come Observable o factory → solo `FieldOption[]` statico
 * - `displayFn` → funzione non serializzabile
 */
export type DynamicGridColumnConfig = Omit<GridColumnConfig, 'filterOptions' | 'displayFn'> & {
  /** Solo array statico di opzioni filtro */
  filterOptions?: FieldOption[];
};

export interface FormFieldConfig {
  type: FieldType;
  /** Chiave univoca del campo — corrisponde alla proprietà nel modello tipizzato */
  field: string;
  label: string;
  placeholder?: string;
  defaultValue?: unknown;
  validators?: ValidatorConfig[];
  /** Validatori sincroni custom a livello di singolo controllo */
  customValidators?: CustomValidatorFn[];
  /** Validatori asincroni a livello di singolo controllo */
  asyncValidators?: AsyncValidatorConfig[];
  /**
   * Lista statica, Observable, oppure lambda `(state) => …`.
   * La lambda riceve i valori correnti del form e restituisce opzioni statiche o un Observable.
   * Utile per dropdown a cascata (es. città dipendenti dalla regione selezionata).
   */
  options?: OptionsLoader;
  /**
   * Ricerca server-side per il combobox.
   * Riceve il termine digitato e restituisce un Observable di opzioni.
   */
  searchFn?: (term: string) => Observable<FieldOption[]>;
  /**
   * Determina la visibilità del campo in base ai valori correnti del form.
   * `true` → campo visibile.
   */
  visibleWhen?: (values: Record<string, unknown>) => boolean;
  arrayConfig?: FormFieldConfig[];
  /** Tipo HTML dell'input; tipizzato per evitare valori non supportati */
  inputType?: InputType;
  /** Formato di visualizzazione per i picker data/ora (es. `'dd/MM/yyyy'`, `'HH:mm'`). Sovrascrive il default del tipo. */
  format?: string;
  multiple?: boolean;
  /**
   * Controlla se il campo viene renderizzato nel form.
   * `undefined` (default) o `true` → campo visibile.
   * `false` → campo nascosto nel form ma presente nel modello e nel payload.
   * Utile per campi tecnici come l'ID del record in modalità edit.
   */
  showInForm?: boolean;
  /**
   * Rende il campo non modificabile dall'utente.
   * `true` → sempre disabilitato.
   * `(values: T) => boolean` → disabilitato condizionalmente in base ai valori del form.
   * Il valore è sempre incluso nel payload serializzato.
   */
  disabled?: boolean | ((values: Record<string, unknown>) => boolean);
  /** Configurazione della dialog di lookup (solo per FieldType.Lookup) */
  lookupConfig?: LookupConfig;
  /**
   * Numero di colonne che il campo occupa nel layout grid del form.
   * Richiede che `FormRendererComponent` riceva `[columns]` > 1.
   * Default `1`. Usare `colSpan` uguale al numero di colonne del form per occupare tutta la larghezza.
   */
  colSpan?: number;
  /**
   * Controlla se l'utente può aggiungere o rimuovere righe in un campo Array.
   * Default `true`. `false` → lista a struttura fissa: nessun pulsante Aggiungi né Rimuovi.
   */
  mutable?: boolean;
  /**
   * Colonna di partenza nel layout grid (1-based, come `grid-column-start` CSS).
   * Se omesso il campo segue il flusso automatico della grid.
   * Combinato con `colSpan` genera `grid-column: <colStart> / span <colSpan>`.
   * Esempio Bootstrap-like con `columns=12`: `colStart: 3, colSpan: 5` → occupa le colonne 3–7,
   * lasciando 2 slot vuoti prima e 5 dopo.
   */
  colStart?: number;
}
