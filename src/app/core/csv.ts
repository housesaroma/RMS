/** Downloads rows as a semicolon CSV with a BOM, so Excel opens Cyrillic correctly. */
export function downloadCsv(name: string, head: string[], rows: unknown[][]): void {
  const cell = (v: unknown) => `"${String(v ?? '—').replaceAll('"', '""')}"`;
  const text = '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
