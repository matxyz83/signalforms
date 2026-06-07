import { ValidationError } from '@angular/forms/signals';

export interface ErrorInfo {
  key: string;
  params?: Record<string, unknown>;
}

export function firstErrorInfo(errors: readonly ValidationError[]): ErrorInfo {
  const first = errors[0];
  if (!first) return { key: '' };
  if (first.message) return { key: first.message };
  const e = first as ValidationError & Record<string, unknown>;
  switch (first.kind) {
    case 'required':  return { key: 'errors.required' };
    case 'email':     return { key: 'errors.email' };
    case 'minLength': return { key: 'errors.minLength', params: { min: e['minLength'] as number } };
    case 'maxLength': return { key: 'errors.maxLength', params: { max: e['maxLength'] as number } };
    case 'min':       return { key: 'errors.min',       params: { min: e['min'] as number } };
    case 'max':       return { key: 'errors.max',       params: { max: e['max'] as number } };
    case 'pattern':   return { key: 'errors.pattern' };
    default:          return { key: first.kind };
  }
}
