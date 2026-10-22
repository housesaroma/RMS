import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API, errorMessage } from '../../core/api';
import { date, daysLeft, rub } from '../../core/format';
import {
  ApprovalItem,
  ApprovalsPage,
  MEASURE_STATUS_NAMES,
  MeasureAction,
  MeasurePage,
  MeasureQuery,
  MeasureRow,
  MeasureStatus,
  REQUEST_STATUS_NAMES,
} from '../../core/models';
import { MEASURE_ACTION_NAMES, approvalLevel } from '../../core/risk-rules';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { MeasureStatusChip } from '../../ui/measure-status';
import { PageHeader } from '../../ui/page-header';
import { MeasureActions } from './measure-actions';

type Tab = 'all' | 'approvals' | 'mine';

const STATUSES: MeasureStatus[] = [
  'DRAFT',
  'APPROVAL',
  'APPROVED',
  'PENDING',
  'IN_PROGRESS',
  'HOLD',
  'DONE',
  'CANCELLED',
];

@Component({
  selector: 'app-measures',
  imports: [PageHeader, Icon, MeasureStatusChip, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './measures.html',
  styleUrl: './measures.scss',
})
export class Measures {
  private readonly router = inject(Router);
  private readonly api = inject(RisksApi);
  private readonly actions = inject(MeasureActions);

  // Bound from the URL query.
  readonly tab = input<Tab>();
  readonly status = input<MeasureStatus>();
  readonly q = input<string>();
  readonly directorate = input<string>();
  readonly executor = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly page = input<string>();

  protected readonly current = computed<Tab>(() => this.tab() ?? 'all');
  protected readonly query = computed<MeasureQuery>(() => ({
    tab: this.current() === 'mine' ? 'mine' : 'all',
    status: this.status() ?? '',
    q: this.q() ?? '',
    directorate: this.directorate() ?? '',
    executor: this.executor() ?? '',
    from: this.from() ?? '',
    to: this.to() ?? '',
    page: Math.max(1, Number(this.page()) || 1),
  }));

  protected readonly list = httpResource<MeasurePage>(() => {
    const q = this.query();
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(q))
      if (v !== '' && !(k === 'page' && v === 1)) params[k] = String(v);
    return { url: `${API}/measures`, params };
  });
  protected readonly data = linkedSignal<MeasurePage | undefined, MeasurePage | undefined>({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (next, prev) => next ?? prev?.value,
  });
  protected readonly approvals = httpResource<ApprovalsPage>(() =>
    this.current() === 'approvals' ? `${API}/approvals` : undefined,
  );

  protected readonly dict = this.api.dictionaries;
  protected readonly executors = computed(() =>
    Object.values(this.dict.value()?.staff ?? {})
      .flat()
      .sort((a, b) => a.localeCompare(b, 'ru')),
  );

  protected readonly statuses = STATUSES;
  protected readonly statusNames = MEASURE_STATUS_NAMES;
  protected readonly rub = rub;
  protected readonly date = date;
  protected readonly requestNames = REQUEST_STATUS_NAMES;
  protected actionLabel(a: MeasureAction): string {
    return MEASURE_ACTION_NAMES[a];
  }

  protected readonly filtered = computed(() => {
    const q = this.query();
    return !!(q.status || q.q || q.directorate || q.executor || q.from || q.to);
  });

  protected readonly subtitle = computed(() => {
    const c = this.data()?.counts;
    if (!c || this.current() === 'mine') return '';
    return `${c.APPROVAL} на согласовании, ${c.PENDING + c.IN_PROGRESS} в работе и ожидают выполнения, ${c.DONE} выполнено.`;
  });

  protected readonly lastPage = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  });

  protected readonly thresholdText = computed(() => {
    const t = this.dict.value()?.approval;
    return t
      ? [`OWNER от ${rub(t.owner)}`, `DIRECTOR от ${rub(t.director)}`, `CEO от ${rub(t.ceo)}`]
      : [];
  });

  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly search = linkedSignal(() => this.q() ?? '');
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected setSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.patch({ q: value.trim() || null }), 300);
  }

  protected patch(params: Record<string, string | null>, keepPage = false): void {
    this.router.navigate([], {
      queryParams: keepPage ? params : { ...params, page: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setTab(t: Tab): void {
    clearTimeout(this.searchTimer);
    this.notice.set(null);
    this.router.navigate([], { queryParams: t === 'all' ? {} : { tab: t }, replaceUrl: true });
  }

  protected reset(): void {
    clearTimeout(this.searchTimer);
    this.router.navigate([], {
      queryParams: this.current() === 'all' ? {} : { tab: this.current() },
      replaceUrl: true,
    });
  }

  protected level(m: MeasureRow): string {
    const t = this.dict.value()?.approval;
    return t ? approvalLevel(m.costPlanned, t) : '';
  }

  protected due(m: MeasureRow): { text: string; sub: string; late: boolean } {
    if (!m.dueDate) return { text: '—', sub: '', late: false };
    if (m.status === 'DONE' || m.status === 'CANCELLED')
      return { text: date(m.dueDate), sub: '', late: false };
    const n = daysLeft(m.dueDate);
    return {
      text: date(m.dueDate),
      sub: n >= 0 ? `через ${n} дн.` : `просрочено на ${-n} дн.`,
      late: n < 0,
    };
  }

  protected waitText(sentAt: string): string {
    const n = -daysLeft(sentAt.slice(0, 10));
    return n <= 0 ? 'отправлен сегодня' : `ждёт ${n} дн.`;
  }

  protected rowById(id: string): MeasureRow | undefined {
    return this.data()?.items.find((x) => x.id === id);
  }

  protected async run(m: MeasureRow, item: MeasureRow['actions'][number]): Promise<void> {
    this.notice.set(null);
    try {
      const updated = await this.actions.run({
        measure: m,
        action: item.action,
        executors: this.dict.value()?.staff[m.directorate] ?? [],
        directorate: m.directorate,
        ends: item.ends,
        draftsLeft: m.draftsLeft,
      });
      if (!updated) return;
      this.notice.set({ text: updated.history[0]?.text ?? 'Готово.', error: false });
      this.list.reload();
      if (this.current() === 'approvals') this.approvals.reload();
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    }
  }

  protected decide(item: ApprovalItem, action: 'approve' | 'reject'): void {
    const a = item.measure.actions.find((x) => x.action === action);
    if (a) this.run(item.measure, a);
  }

  protected gate(item: ApprovalItem, action: 'approve' | 'reject') {
    return item.measure.actions.find((x) => x.action === action) ?? { ok: false, why: '' };
  }
}
