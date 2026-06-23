import { Injectable } from '@angular/core';
import {
  DynamicFieldConfig, DynamicGridColumnConfig, DynamicVisibilityRule,
  FieldOption, FormFieldConfig, GridColumnConfig,
} from '../models/form-field-config';

@Injectable({ providedIn: 'root' })
export class DynamicFormService {

  /**
   * Dal payload emesso da `FormRendererComponent` (evento `formSubmit`), separa i campi
   * dinamici da quelli statici, serializza i dinamici in JSON e li inietta nel campo `data`.
   *
   * Usare in `onFormSubmit` per ricollassare i campi flat nel campo `data: string`:
   * ```typescript
   * onFormSubmit(payload: Record<string, unknown>): void {
   *   const body = this.dynamicService.collapsePayload(payload, this.dynamicConfig);
   *   // body = { id, nome, ..., data: '{"campoA":"x","campoB":42}' }
   *   this.http.post('/api/entity', body).subscribe(...);
   * }
   * ```
   */
  collapsePayload(
    payload: Record<string, unknown>,
    config: DynamicFieldConfig[],
  ): Record<string, unknown> {
    const dynamicKeys = new Set(config.map(f => f.field));
    const dynamicValues: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (dynamicKeys.has(k)) dynamicValues[k] = v;
      else rest[k] = v;
    }
    return { ...rest, data: JSON.stringify(dynamicValues) };
  }

  /**
   * Parsa il campo `data: string` e restituisce un oggetto flat con i valori dei campi dinamici.
   * I campi assenti vengono inizializzati con `defaultValue` o `null`.
   *
   * Chiamare prima di inizializzare il signal del form:
   * ```typescript
   * this.formModel.set({ ...entity, ...dynamicService.parseData(entity.data, dynamicConfig) });
   * ```
   */
  parseData(
    data: string | null | undefined,
    config: DynamicFieldConfig[],
  ): Record<string, unknown> {
    let parsed: Record<string, unknown> = {};
    if (data) {
      try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { /* ignora JSON corrotto */ }
    }
    return Object.fromEntries(
      config.map(f => [f.field, f.field in parsed ? parsed[f.field] : (f.defaultValue ?? null)]),
    );
  }

  /**
   * Serializza un sottoinsieme di valori form in JSON string.
   * Filtra solo i campi presenti in `config`.
   */
  serializeData(values: Record<string, unknown>, config: DynamicFieldConfig[]): string {
    const keys = new Set(config.map(f => f.field));
    return JSON.stringify(
      Object.fromEntries(Object.entries(values).filter(([k]) => keys.has(k))),
    );
  }

  /**
   * Converte `DynamicFieldConfig[]` in `FormFieldConfig[]` per `buildForm` / `FormRendererComponent`.
   *
   * La conversione è diretta (sottoinsieme compatibile) tranne per `visibleWhen`,
   * che viene convertito dalla forma dichiarativa (`DynamicVisibilityRule`) alla lambda attesa.
   */
  toFormConfig(config: DynamicFieldConfig[]): FormFieldConfig[] {
    return config.map(({ visibleWhen, ...rest }) => {
      const formConfig = rest as FormFieldConfig;
      if (visibleWhen) {
        formConfig.visibleWhen = values => this.evaluateRule(visibleWhen, values);
      }
      return formConfig;
    });
  }

  /**
   * Converte `DynamicGridColumnConfig[]` in `GridColumnConfig[]` per `GridRendererComponent`.
   * La conversione è diretta — `DynamicGridColumnConfig` è un sottoinsieme compatibile.
   */
  toGridColumns(config: DynamicGridColumnConfig[]): GridColumnConfig[] {
    return config as GridColumnConfig[];
  }

  private evaluateRule(rule: DynamicVisibilityRule, values: Record<string, unknown>): boolean {
    const raw = values[rule.field];
    // Per Select/Combobox il valore è un FieldOption — confronta su .value
    const v = raw != null && typeof raw === 'object' && 'value' in (raw as object)
      ? (raw as FieldOption).value
      : raw;
    switch (rule.operator) {
      case 'eq':     return v === rule.value;
      case 'neq':    return v !== rule.value;
      case 'truthy': return !!v;
      case 'falsy':  return !v;
      default:       return true;
    }
  }
}
