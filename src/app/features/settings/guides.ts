import { Component, computed, inject, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';

type Kind = 'hazards' | 'categories';

@Component({
  selector: 'app-settings-guides',
  imports: [PageHeader, SettingsTabs, Icon],
  templateUrl: './guides.html',
  styleUrl: './settings.scss',
})
export class Guides {
  private readonly api = inject(AdminApi);
  protected readonly dict = inject(RisksApi).dictionaries;
  protected readonly note = noteOf('guides');

  protected readonly kind = signal<Kind>('hazards');
  protected readonly q = signal('');
  protected readonly draft = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);

  protected readonly items = computed(() => {
    const d = this.dict.value();
    if (!d) return [];
    const q = this.q().trim().toLowerCase();
    return d[this.kind()]
      .filter((x) => !q || x.toLowerCase().includes(q))
      .map((name) => ({ name, off: d.disabled.includes(name) }));
  });

  protected async add(): Promise<void> {
    const name = this.draft().trim();
    const d = this.dict.value()!;
    if (!name) return;
    if (d[this.kind()].some((x) => x.toLowerCase() === name.toLowerCase())) {
      this.notice.set({ text: 'Такая запись уже есть', error: true });
      return;
    }
    try {
      await this.api.updateDictionaries({ [this.kind()]: [...d[this.kind()], name] });
      this.draft.set('');
      this.notice.set({
        text: `Запись «${name}» добавлена и доступна в новых рисках.`,
        error: false,
      });
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    }
  }

  protected async toggle(name: string, off: boolean): Promise<void> {
    const d = this.dict.value()!;
    try {
      await this.api.updateDictionaries({
        disabled: off ? [...d.disabled, name] : d.disabled.filter((x) => x !== name),
      });
      this.notice.set({
        text: off
          ? `«${name}» выключена: в новых рисках её не выбрать, у существующих связь сохраняется.`
          : `«${name}» снова доступна.`,
        error: false,
      });
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    }
  }
}
