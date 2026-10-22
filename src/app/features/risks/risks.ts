import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth';
import { Risk, RiskPage, RiskQuery, RiskTab } from '../../core/models';
import { RisksApi, riskParams } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { RiskScore } from '../../ui/risk-score';
import { RiskStatusChip } from '../../ui/risk-status';
import { RiskCreate } from './risk-create';

const TABS: { key: RiskTab | 'CLOSED'; name: string }[] = [
  { key: 'all', name: 'Все' },
  { key: 'DRAFT', name: 'Черновики' },
  { key: 'ACTIVE', name: 'Активные' },
  { key: 'REASSESSMENT', name: 'На переоценке' },
  { key: 'ACCEPTED', name: 'Принятые' },
  { key: 'CLOSED', name: 'Закрытые' },
];

const DEFAULT_THRESHOLDS = { owner: 10, director: 15, ceo: 19 };

@Component({
  selector: 'app-risks',
  imports: [
    PageHeader,
    Icon,
    RiskScore,
    RiskStatusChip,
    RouterLink,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
  ],
  templateUrl: './risks.html',
  styleUrl: './risks.scss',
})
export class Risks {
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(RisksApi);
  protected readonly auth = inject(AuthService);

  // Filters are bound from the URL query, so a filtered registry is a shareable link.
  readonly tab = input<RiskTab | 'CLOSED' | undefined>();
  readonly q = input<string>();
  readonly directorate = input<string>();
  readonly category = input<string>();
  readonly owner = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly ceo = input<string>();
  readonly sort = input<RiskQuery['sort']>();
  readonly page = input<string>();

  protected readonly tabs = TABS;
  protected readonly closedTab = computed(() => this.tab() === 'CLOSED');
  protected readonly query = computed<RiskQuery>(() => ({
    tab: this.tab() === 'CLOSED' ? 'all' : ((this.tab() as RiskTab | undefined) ?? 'all'),
    q: this.q() ?? '',
    directorate: this.directorate() ?? '',
    category: this.category() ?? '',
    owner: this.owner() ?? '',
    from: this.from() ?? '',
    to: this.to() ?? '',
    ceo: this.ceo() === 'true',
    sort: this.sort() ?? '',
    page: Math.max(1, Number(this.page()) || 1),
  }));

  protected readonly list = httpResource<RiskPage>(() => ({
    url: `${API}/risks`,
    params: riskParams(this.query()),
  }));
  /** Last loaded page stays on screen while the next one loads. */
  protected readonly data = linkedSignal<RiskPage | undefined, RiskPage | undefined>({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (next, prev) => next ?? prev?.value,
  });

  protected readonly dict = this.api.dictionaries;
  protected readonly thresholds = computed(
    () => this.dict.value()?.thresholds ?? DEFAULT_THRESHOLDS,
  );
  protected readonly owners = computed(() =>
    [...new Set(this.dict.value()?.processes.map((p) => p.owner) ?? [])].sort(),
  );

  protected readonly filtered = computed(() => {
    const q = this.query();
    return (
      q.tab !== 'all' ||
      q.ceo ||
      !!q.q ||
      !!q.directorate ||
      !!q.category ||
      !!q.owner ||
      !!q.from ||
      !!q.to
    );
  });

  protected readonly subtitle = computed(() => {
    const c = this.data()?.counts;
    return c
      ? `${c.all} ${plural(c.all, 'риск', 'риска', 'рисков')} в реестре: ${c.DRAFT} ${plural(c.DRAFT, 'черновик ждёт', 'черновика ждут', 'черновиков ждут')} первичной оценки, ${c.REASSESSMENT} ${plural(c.REASSESSMENT, 'риск ждёт', 'риска ждут', 'рисков ждут')} переоценки.`
      : '';
  });

  protected readonly lastPage = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  });

  protected readonly pages = computed(() => {
    const last = this.lastPage();
    const cur = this.query().page;
    const keep = (n: number) => n === 1 || n === last || Math.abs(n - cur) <= 1;
    const out: (number | null)[] = [];
    for (let n = 1; n <= last; n++) {
      if (keep(n)) out.push(n);
      else if (out.at(-1) !== null) out.push(null);
    }
    return out;
  });

  protected readonly range = computed(() => {
    const d = this.data();
    if (!d || !d.total) return '';
    const start = (d.page - 1) * d.pageSize + 1;
    return this.filtered()
      ? `Найдено: ${d.total}`
      : `${start}–${start + d.items.length - 1} из ${d.total}`;
  });

  protected readonly selected = signal<string[]>([]);
  protected readonly allPicked = computed(() => {
    const ids = this.data()?.items.map((r) => r.id) ?? [];
    return ids.length > 0 && ids.every((id) => this.selected().includes(id));
  });
  protected readonly freshId = signal('');
  protected readonly notice = signal('');

  // Search box is local while typing; the URL follows after a short pause.
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

  protected setTab(key: RiskTab | 'CLOSED'): void {
    this.patch({ tab: key === 'all' ? null : key });
  }

  protected toggleSort(): void {
    this.patch({ sort: this.query().sort === 'desc' ? 'asc' : 'desc' });
  }

  protected reset(): void {
    clearTimeout(this.searchTimer);
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected toggle(id: string): void {
    this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  protected toggleAll(): void {
    const ids = this.data()?.items.map((r) => r.id) ?? [];
    this.selected.update((s) =>
      this.allPicked() ? s.filter((id) => !ids.includes(id)) : [...new Set([...s, ...ids])],
    );
  }

  protected async exportRisks(ids?: string[]): Promise<void> {
    try {
      await this.api.export(ids ? { ids } : this.query());
    } catch (e) {
      this.notice.set(errorMessage(e, 'Не удалось выгрузить риски. Повторите попытку.'));
    }
  }

  protected openCreate(): void {
    const ref = this.dialog.open<Risk>(RiskCreate, {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'dialog-pane',
      backdropClass: 'dialog-backdrop',
      ariaLabelledBy: 'nr-title',
    });
    ref.closed.subscribe((risk) => {
      if (!risk) return;
      this.freshId.set(risk.id);
      this.notice.set(
        `Риск ${risk.id} создан в статусе «Черновик». Оценку проведёт владелец процесса.`,
      );
      if (this.filtered() || this.query().page !== 1 || this.query().sort) this.reset();
      else this.list.reload();
    });
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
