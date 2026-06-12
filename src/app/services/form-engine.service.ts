import { inject, Injectable, Injector, resource, runInInjectionContext, WritableSignal } from '@angular/core';
import {
  email, FieldTree, form, hidden, max, maxLength, min, minLength,
  pattern, required, validate, validateAsync, validateTree, applyEach,
} from '@angular/forms/signals';
import {
  AsyncValidatorConfig, FieldType, FormBuildOptions, FormFieldConfig,
  ValidatorConfig, ValidatorType,
} from '../models/form-field-config';

@Injectable({ providedIn: 'root' })
export class FormEngineService {
  private readonly injector = inject(Injector);

  /**
   * Costruisce un FieldTree<T> dall'API ufficiale Angular Signal Forms.
   * @param model  Signal tipizzato con i valori iniziali del form
   * @param config Array di FormFieldConfig che guida rendering e validazione
   * @param options Validatori form-level opzionali
   */
  buildForm<T>(
    model: WritableSignal<T>,
    config: FormFieldConfig[],
    options?: FormBuildOptions<T>,
  ): FieldTree<T> {
    return form(model, (schemaPath: any) => {
      this.applyFieldSchema(schemaPath, config, model as WritableSignal<any>);

      for (const fn of options?.validators ?? []) {
        // ctx.value is a Signal<T> — must call value() to get the actual value
        validateTree(schemaPath, ({ value }: any) => fn(value() as T) as any);
      }
    });
  }

  private applyFieldSchema(
    schemaPath: any,
    config: FormFieldConfig[],
    model: WritableSignal<any>,
  ): void {
    for (const field of config) {
      const path = schemaPath[field.field];

      // No-op validator ensures Angular registers this field's FieldTree node.
      // Without at least one schema call, form[fieldName] returns undefined for
      // unconstrained fields, causing "fieldFor(...) is not a function" at runtime.
      validate(path, () => null);

      for (const v of field.validators ?? []) {
        this.applyBuiltinValidator(path, v);
      }

      for (const fn of field.customValidators ?? []) {
        // ctx.value is a Signal<T> — must call value() to get the actual value
        validate(path, ({ value }: any) => fn(value()) as any);
      }

      for (const asyncV of field.asyncValidators ?? []) {
        this.applyAsyncValidator(path, asyncV);
      }

      if (field.visibleWhen) {
        const vw = field.visibleWhen;
        hidden(path, { when: () => !vw(model() as Record<string, unknown>) });
      }

      if (field.type === FieldType.Array && field.arrayConfig?.length) {
        const subConfig = field.arrayConfig;
        applyEach(path, (itemPath: any) => {
          this.applyFieldSchema(itemPath, subConfig, model);
        });
      }
    }
  }

  private applyBuiltinValidator(path: any, v: ValidatorConfig): void {
    const opt = v.message ? { message: v.message } : undefined;
    switch (v.type) {
      case ValidatorType.Required:   required(path, opt);                                   break;
      case ValidatorType.Email:      email(path, opt);                                      break;
      case ValidatorType.Min:        min(path, Number(v.value ?? 0), opt);                  break;
      case ValidatorType.Max:        max(path, Number(v.value ?? 0), opt);                  break;
      case ValidatorType.MinLength:  minLength(path, Number(v.value ?? 0), opt);            break;
      case ValidatorType.MaxLength:  maxLength(path, Number(v.value ?? 0), opt);            break;
      case ValidatorType.Pattern:    pattern(path, new RegExp(String(v.value ?? '')), opt); break;
    }
  }

  private applyAsyncValidator(path: any, asyncV: AsyncValidatorConfig): void {
    const injector = this.injector;
    validateAsync(path, {
      params: ({ value }: any) =>
        value !== undefined && value !== null && value !== '' ? value : undefined,
      factory: (params: any) =>
        runInInjectionContext(injector, () =>
          resource({
            params: () => (params as any)(),
            loader: async ({ params: p }: any) => {
              if (p === undefined) return undefined;
              return asyncV.validate(p);
            },
          }),
        ),
      onSuccess: (result: any) => result ?? null,
      onError:   () => ({ kind: 'asyncError', message: 'Errore di validazione' }),
      debounce:  asyncV.debounce ?? 300,
    });
  }

}
