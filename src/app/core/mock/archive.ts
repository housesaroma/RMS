import { HttpParams } from '@angular/common/http';
import { ArchivePage, ArchiveQuery, RiskDetails } from '../models';
import { toRisk } from './risks';

const PAGE_SIZE = 10;

export function parseArchiveQuery(p: HttpParams): ArchiveQuery {
  return {
    q: p.get('q') ?? '',
    hazard: p.get('hazard') ?? '',
    category: p.get('category') ?? '',
    owner: p.get('owner') ?? '',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    page: Number(p.get('page')) || 1,
  };
}

/** Closed risks, newest closure first; dates filter by closure day. */
export function archivePage(all: RiskDetails[], q: ArchiveQuery): ArchivePage {
  const closed = all.filter((r) => r.status === 'CLOSED');
  const text = q.q.trim().toLowerCase();
  const list = closed
    .filter(
      (r) =>
        (!text || r.name.toLowerCase().includes(text) || r.id.toLowerCase().includes(text)) &&
        (!q.hazard || r.hazard === q.hazard) &&
        (!q.category || r.category === q.category) &&
        (!q.owner || r.owner === q.owner) &&
        (!q.from || r.closedAt!.slice(0, 10) >= q.from) &&
        (!q.to || r.closedAt!.slice(0, 10) <= q.to),
    )
    .sort((a, b) => b.closedAt!.localeCompare(a.closedAt!));
  return {
    items: list.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE).map((r) => ({
      ...toRisk(r),
      closedAt: r.closedAt!,
      closeReason: r.closeReason ?? '',
      closedBy: r.closedBy ?? '',
      lastScore: r.previous?.score ?? null,
    })),
    total: list.length,
    page: q.page,
    pageSize: PAGE_SIZE,
    all: all.length,
    lastClosedAt:
      closed
        .map((r) => r.closedAt!)
        .sort()
        .at(-1) ?? null,
  };
}
