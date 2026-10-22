import { HttpClient, HttpParams, httpResource } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from './api';
import { Dictionaries, NewRisk, Risk, RiskQuery } from './models';

/** Query → HTTP params, skipping defaults so URLs and requests stay short. */
export function riskParams(q: Partial<RiskQuery>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (
      v === '' ||
      v === false ||
      v == null ||
      (k === 'tab' && v === 'all') ||
      (k === 'page' && v === 1)
    )
      continue;
    out[k] = String(v);
  }
  return out;
}

@Service()
export class RisksApi {
  private readonly http = inject(HttpClient);

  /** Reference data changes rarely; one shared resource for filters and forms. */
  readonly dictionaries = httpResource<Dictionaries>(() => `${API}/dictionaries`);

  create(body: NewRisk): Promise<Risk> {
    return firstValueFrom(this.http.post<Risk>(`${API}/risks`, body));
  }

  /** Downloads the CSV export: either the given ids or everything matching the filters. */
  async export(filter: { ids: string[] } | Partial<RiskQuery>): Promise<void> {
    const params = new HttpParams({
      fromObject:
        'ids' in filter ? { ids: filter.ids.join(',') } : riskParams({ ...filter, page: 1 }),
    });
    const blob = await firstValueFrom(
      this.http.get(`${API}/risks/export`, { params, responseType: 'blob' }),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `risks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
