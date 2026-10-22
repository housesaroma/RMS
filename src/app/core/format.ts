import { Level, Thresholds } from './models';

const NBSP = ' ';

/** 2400000 → "2 400 000 ₽" with non-breaking spaces. */
export function rub(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/\s/g, NBSP) + NBSP + '₽';
}

/** ISO date or datetime → "12.09.2026" or "12.09.2026 16:05" in local time. */
export function date(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  if (iso.length === 10) return iso.split('-').reverse().join('.');
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
}

/** Whole days from today to an ISO date; negative when overdue. */
export function daysLeft(iso: string, today = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(iso + 'T00:00:00').getTime() - start.getTime()) / 864e5);
}

export function levelRange(level: Level, t: Thresholds): string {
  switch (level) {
    case 'OWNER':
      return `0–${t.owner}`;
    case 'DIRECTOR':
      return `${t.owner + 1}–${t.director}`;
    case 'CEO':
      return `${t.director + 1}–${t.ceo}`;
    case 'TREATMENT_REQUIRED':
      return `${t.ceo + 1}–25`;
  }
}

/** 40 h → "1 дн 16 ч"; weeks are shown only when present. */
export function duration(hours: number): string {
  const w = Math.floor(hours / 168);
  const d = Math.floor((hours % 168) / 24);
  const h = +(hours % 24).toFixed(2);
  return [w && `${w} нед`, d && `${d} дн`, (h || (!w && !d)) && `${h} ч`].filter(Boolean).join(' ');
}

/** "Белов Александр Николаевич" → "АБ" (first name, then last name, as in the prototype). */
export function initials(fullName: string): string {
  const [last = '', first = ''] = fullName.split(' ');
  return (first[0] ?? '') + (last[0] ?? '');
}
