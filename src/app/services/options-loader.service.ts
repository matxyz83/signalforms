import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { FieldOption } from '../models/form-field-config';

@Injectable({ providedIn: 'root' })
export class OptionsLoaderService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, FieldOption[]>();

  /**
   * Carica le opzioni da un endpoint remoto.
   * Usa una cache in-memory per evitare richieste duplicate.
   *
   * @param url  Endpoint da cui caricare le opzioni
   * @param params  Query params aggiuntivi
   */
  loadOptions(url: string, params?: Record<string, string>): Observable<FieldOption[]> {
    const cacheKey = url + JSON.stringify(params ?? {});

    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    let httpParams = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        httpParams = httpParams.set(k, v);
      }
    }

    return this.http.get<FieldOption[]>(url, { params: httpParams }).pipe(
      map(data => this.normalizeOptions(data)),
      tap(options => this.cache.set(cacheKey, options)),
      catchError(() => of([])),
    );
  }

  /** Svuota la cache (utile nei test) */
  clearCache(): void {
    this.cache.clear();
  }

  private normalizeOptions(data: unknown[]): FieldOption[] {
    return data.map(item => {
      // if (typeof item === 'object' && item !== null && 'value' in item && 'label' in item) {
      //   return item as FieldOption;
      // }
      if (typeof item === 'object' && item !== null && 'codice' in item && 'nome' in item) {
         return { value: item.codice, label: String(item.nome) };
      }
      return { value: item, label: String(item) };
    });
  }
}
