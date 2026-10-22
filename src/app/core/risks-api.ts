import { HttpClient, HttpParams, httpResource } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from './api';
import {
  AssessmentInput,
  Dictionaries,
  MeasureActionInput,
  NewMeasure,
  NewRisk,
  ResponseMode,
  Risk,
  RiskDetails,
  RiskQuery,
} from './models';

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

  // Card actions return the updated card.
  assess(id: string, body: AssessmentInput): Promise<RiskDetails> {
    return firstValueFrom(this.http.post<RiskDetails>(`${API}/risks/${id}/assessments`, body));
  }

  chooseMode(id: string, mode: ResponseMode): Promise<RiskDetails> {
    return firstValueFrom(this.http.post<RiskDetails>(`${API}/risks/${id}/mode`, { mode }));
  }

  comment(id: string, text: string): Promise<RiskDetails> {
    return firstValueFrom(this.http.post<RiskDetails>(`${API}/risks/${id}/comments`, { text }));
  }

  /** Bumped after measure changes so counters elsewhere (the approvals badge) refresh. */
  readonly measuresChanged = signal(0);

  /** Runs a measure transition; returns the card of the measure's risk. */
  async measureAction(measureId: string, body: MeasureActionInput): Promise<RiskDetails> {
    const card = await firstValueFrom(
      this.http.post<RiskDetails>(`${API}/measures/${measureId}/actions`, body),
    );
    this.measuresChanged.update((n) => n + 1);
    return card;
  }

  createMeasure(id: string, body: NewMeasure): Promise<RiskDetails> {
    return firstValueFrom(this.http.post<RiskDetails>(`${API}/risks/${id}/measures`, body));
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
