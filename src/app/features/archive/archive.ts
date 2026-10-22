import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API, errorMessage } from '../../core/api';
import { date } from '../../core/format';
import { ArchivePage, ArchiveQuery, ArchiveRow, levelOf } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';

@Component({
  selector: 'app-archive',
  imports: [PageHeader, Icon, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './archive.html',
  // Same layout and table as the registry.
  styleUrl: '../risks/risks.scss',
})
export class Archive {
  private readonly router = inject(Router);
  private readonly api = inject(RisksApi);

  readonly q = input<string>();
  readonly hazard = input<string>();
  readonly category = input<string>();
  readonly owner = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly page = input<string>();

  protected readonly query = computed<ArchiveQuery>(() => ({
    q: this.q() ?? '',
    hazard: this.hazard() ?? '',
    category: this.category() ?? '',
    owner: this.owner() ?? '',
    from: this.from() ?? '',
    to: this.to() ?? '',
    page: Math.max(1, Number(this.page()) || 1),
  }));

  protected readonly list = httpResource<ArchivePage>(() => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.query()))
      if (v !== '' && !(k === 'page' && v === 1)) params[k] = String(v);
    return { url: `${API}/archive`, params };
  });
  protected readonly data = linkedSignal<ArchivePage | undefined, ArchivePage | undefined>({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (next, prev) => next ?? prev?.value,
  });

  protected readonly dict = this.api.dictionaries;
  protected readonly owners = computed(() =>
    [...new Set(this.dict.value()?.processes.map((p) => p.owner) ?? [])].sort(),
  );
  protected readonly date = date;

  protected readonly filtered = computed(() =>
    Object.entries(this.query()).some(([k, v]) => k !== 'page' && v !== ''),
  );
  protected readonly lastPage = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  });
  protected readonly subtitle = computed(() => {
    const d = this.data();
    return d
      ? `Закрыто ${d.total} из ${d.all} рисков${d.lastClosedAt ? `, последнее закрытие ${date(d.lastClosedAt)}` : ''}. Возврат отправляет риск на переоценку.`
      : 'Закрытые риски хранятся без удаления. Возврат отправляет риск на переоценку.';
  });

  protected level(score: number): string {
    return levelOf(score, this.dict.value()?.thresholds ?? { owner: 10, director: 15, ceo: 19 });
  }

  protected readonly search = linkedSignal(() => this.q() ?? '');
  private timer?: ReturnType<typeof setTimeout>;
  protected readonly notice = signal<{ text: string; error: boolean; id?: string } | null>(null);

  protected setSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.patch({ q: v.trim() || null }), 300);
  }

  protected patch(params: Record<string, string | null>, keepPage = false): void {
    this.router.navigate([], {
      queryParams: keepPage ? params : { ...params, page: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reset(): void {
    clearTimeout(this.timer);
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected async exportAll(): Promise<void> {
    const ids = this.data()?.items.map((r) => r.id) ?? [];
    if (ids.length) await this.api.export({ ids });
  }

  /** The server checks rights; the menu offers the action to everyone who opened the archive. */
  protected async reopen(r: ArchiveRow): Promise<void> {
    this.notice.set(null);
    try {
      const card = await this.api.reopen(r.id);
      this.notice.set({
        text: `${r.id} возвращён в статус «${card.status === 'DRAFT' ? 'Черновик' : 'Ожидает переоценки'}». Нужна оценка владельца процесса.`,
        error: false,
        id: r.id,
      });
      this.list.reload();
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    }
  }
}
