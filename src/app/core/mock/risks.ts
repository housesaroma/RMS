import { HttpParams } from '@angular/common/http';
import {
  Dictionaries,
  NewRisk,
  RISK_STATUS_NAMES,
  Risk,
  RiskPage,
  RiskQuery,
  RiskTab,
  User,
} from '../models';

export const PAGE_SIZE = 10;

const score = (r: Risk) => (r.likelihood ?? 0) * (r.impact ?? 0);

export function parseQuery(p: HttpParams): RiskQuery {
  return {
    tab: (p.get('tab') as RiskTab) || 'all',
    q: p.get('q') ?? '',
    directorate: p.get('directorate') ?? '',
    category: p.get('category') ?? '',
    owner: p.get('owner') ?? '',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    ceo: p.get('ceo') === 'true',
    sort: (p.get('sort') as RiskQuery['sort']) ?? '',
    page: Number(p.get('page')) || 1,
  };
}

/** Registry filter: closed risks live in the archive, never in the registry list. */
export function filterRisks(all: Risk[], q: RiskQuery, d: Dictionaries): Risk[] {
  const text = q.q.trim().toLowerCase();
  const list = all.filter(
    (r) =>
      r.status !== 'CLOSED' &&
      (q.tab === 'all' || (q.tab === 'top' ? r.top : r.status === q.tab)) &&
      (!q.ceo || score(r) > d.thresholds.director) &&
      (!text || r.name.toLowerCase().includes(text) || r.id.toLowerCase().includes(text)) &&
      (!q.directorate || r.directorate === q.directorate) &&
      (!q.category || r.category === q.category) &&
      (!q.owner || r.owner === q.owner) &&
      (!q.from || r.createdAt >= q.from) &&
      (!q.to || r.createdAt <= q.to),
  );
  return list.sort((a, b) => {
    if (q.sort) {
      const x = score(a),
        y = score(b);
      // Risks without a current assessment always go last.
      if (!x || !y) return (y ? 1 : 0) - (x ? 1 : 0);
      if (x !== y) return q.sort === 'desc' ? y - x : x - y;
    }
    return b.id.localeCompare(a.id);
  });
}

export function pageRisks(all: Risk[], q: RiskQuery, d: Dictionaries): RiskPage {
  const list = filterRisks(all, q, d);
  const open = all.filter((r) => r.status !== 'CLOSED');
  const count = (s: Risk['status']) => all.filter((r) => r.status === s).length;
  return {
    items: list.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE),
    total: list.length,
    page: q.page,
    pageSize: PAGE_SIZE,
    counts: {
      all: open.length,
      top: open.filter((r) => r.top).length,
      DRAFT: count('DRAFT'),
      ACTIVE: count('ACTIVE'),
      REASSESSMENT: count('REASSESSMENT'),
      ACCEPTED: count('ACCEPTED'),
      CLOSED: count('CLOSED'),
    },
  };
}

/** Returns an error message or null; mirrors the server rules of UC-2-02. */
export function validateNewRisk(body: NewRisk, user: User, d: Dictionaries): string | null {
  const isAdmin = user.rights.includes('admin');
  if (!isAdmin && !user.rights.includes('create_risk'))
    return 'Недостаточно прав для создания риска';
  if (
    !body.name.trim() ||
    !body.description.trim() ||
    !body.hazard ||
    !body.category ||
    !body.process
  )
    return 'Заполните обязательные поля';
  const process = d.processes.find((p) => p.name === body.process);
  if (!process) return 'Процесс не найден или неактивен';
  if (!isAdmin && process.directorate !== user.directorate)
    return 'Можно выбрать только процесс своей дирекции';
  if (body.asset && !d.assets.some((a) => a.name === body.asset && a.hourlyDowntimeCost > 0))
    return 'У объекта не указана стоимость простоя';
  return null;
}

export function createRisk(all: Risk[], body: NewRisk, d: Dictionaries, today: string): Risk {
  const next = Math.max(...all.map((r) => Number(r.id.slice(2)))) + 1;
  const process = d.processes.find((p) => p.name === body.process)!;
  return {
    id: 'R-' + String(next).padStart(4, '0'),
    iso: '—',
    name: body.name.trim(),
    description: body.description.trim(),
    hazard: body.hazard,
    category: body.category,
    process: process.name,
    directorate: process.directorate,
    owner: process.owner,
    asset: body.asset || null,
    createdAt: today,
    likelihood: null,
    impact: null,
    status: 'DRAFT',
    top: body.top,
  };
}

export function toCsv(list: Risk[]): string {
  const head = [
    'ID',
    'ISO',
    'Название',
    'Опасность',
    'Категория',
    'Процесс',
    'Дирекция',
    'Владелец',
    'Объект',
    'Вероятность',
    'Тяжесть',
    'Оценка',
    'Статус',
    'Создан',
  ];
  const cell = (v: unknown) => `"${String(v ?? '—').replaceAll('"', '""')}"`;
  const rows = list.map((r) =>
    [
      r.id,
      r.iso,
      r.name,
      r.hazard,
      r.category,
      r.process,
      r.directorate,
      r.owner,
      r.asset,
      r.likelihood,
      r.impact,
      score(r) || null,
      RISK_STATUS_NAMES[r.status],
      r.createdAt,
    ]
      .map(cell)
      .join(';'),
  );
  // BOM so Excel opens Cyrillic correctly.
  return '﻿' + [head.map(cell).join(';'), ...rows].join('\r\n');
}
