import { Component, computed, inject, resource, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { rub } from '../../core/format';
import { Dictionaries } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';

const short = (fullName: string) => {
  const [last, first = '', middle = ''] = fullName.split(' ');
  return [last, first && `${first[0]}.`, middle && `${middle[0]}.`].filter(Boolean).join(' ');
};

@Component({
  selector: 'app-settings-structure',
  imports: [PageHeader, SettingsTabs, Icon],
  templateUrl: './structure.html',
  styleUrl: './settings.scss',
  styles: `
    .dir {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 20px;
      background: var(--inner-bg);
    }
    .proc {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 220px;
      gap: 10px;
      align-items: center;
      padding: 8px 0;
      border-top: 1px solid var(--line);
    }
    .add {
      display: flex;
      gap: 8px;
    }
    .add .input {
      height: 36px;
      font-size: var(--fs-sm);
    }
  `,
})
export class Structure {
  private readonly api = inject(AdminApi);
  protected readonly dict = inject(RisksApi).dictionaries;
  protected readonly note = noteOf('structure');
  protected readonly users = resource({ loader: () => this.api.users() });
  protected readonly rub = rub;

  protected readonly q = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly newDir = signal('');
  protected readonly newProc = signal<Record<string, string>>({});
  protected readonly newAsset = signal({ name: '', cost: '' });

  protected readonly dirs = computed(() => {
    const d = this.dict.value();
    if (!d) return [];
    const q = this.q().trim().toLowerCase();
    return d.directorates
      .map((name) => ({
        name,
        director: d.directors[name] ?? '',
        processes: d.processes.filter((p) => p.directorate === name),
        staff: (this.users.hasValue() ? this.users.value() : []).filter(
          (u) => u.directorate === name && !u.blocked,
        ).length,
      }))
      .filter(
        (x) =>
          !q ||
          x.name.toLowerCase().includes(q) ||
          x.director.toLowerCase().includes(q) ||
          x.processes.some(
            (p) => p.name.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q),
          ),
      );
  });

  /** Directors and owners are chosen among active users with the matching role. */
  protected readonly directors = computed(() =>
    (this.users.hasValue() ? this.users.value() : []).filter(
      (u) => !u.blocked && u.roles.includes('DIRECTOR'),
    ),
  );
  protected readonly owners = computed(() =>
    (this.users.hasValue() ? this.users.value() : []).filter(
      (u) => !u.blocked && u.roles.includes('OWNER'),
    ),
  );

  private async save(patch: Partial<Dictionaries>, done: string): Promise<boolean> {
    try {
      await this.api.updateDictionaries(patch);
      this.notice.set({ text: done, error: false });
      return true;
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
      return false;
    }
  }

  protected setDirector(dir: string, userId: string): void {
    const u = this.directors().find((x) => x.id === userId);
    const d = this.dict.value()!;
    this.save(
      { directors: { ...d.directors, [dir]: u ? short(u.fullName) : '' } },
      `Директор дирекции «${dir}» назначен.`,
    );
  }

  protected setOwner(process: string, userId: string): void {
    const u = this.owners().find((x) => x.id === userId);
    if (!u) return;
    const d = this.dict.value()!;
    this.save(
      {
        processes: d.processes.map((p) =>
          p.name === process ? { ...p, owner: short(u.fullName), ownerId: u.id } : p,
        ),
      },
      `Владелец процесса «${process}»: ${short(u.fullName)}. Новые риски и меры пойдут к нему.`,
    );
  }

  protected ownerIdOf(process: string): string {
    return this.dict.value()?.processes.find((p) => p.name === process)?.ownerId ?? '';
  }

  protected directorIdOf(dir: string): string {
    const name = this.dict.value()?.directors[dir];
    return this.directors().find((u) => short(u.fullName) === name)?.id ?? '';
  }

  protected async addDirectorate(): Promise<void> {
    const name = this.newDir().trim();
    if (!name) return;
    const d = this.dict.value()!;
    if (
      await this.save(
        { directorates: [...d.directorates, name], staff: { ...d.staff, [name]: [] } },
        `Дирекция «${name}» добавлена.`,
      )
    )
      this.newDir.set('');
  }

  protected async addProcess(dir: string): Promise<void> {
    const name = (this.newProc()[dir] ?? '').trim();
    if (!name) return;
    const d = this.dict.value()!;
    if (d.processes.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      this.notice.set({ text: 'Процесс с таким названием уже есть', error: true });
      return;
    }
    if (
      await this.save(
        { processes: [...d.processes, { name, directorate: dir, owner: '—' }] },
        `Процесс «${name}» добавлен. Назначьте владельца.`,
      )
    )
      this.newProc.update((x) => ({ ...x, [dir]: '' }));
  }

  protected setNewProc(dir: string, v: string): void {
    this.newProc.update((x) => ({ ...x, [dir]: v }));
  }

  protected async setCost(name: string, raw: string): Promise<void> {
    const cost = Number(raw.replace(/\s/g, '').replace(',', '.'));
    const d = this.dict.value()!;
    if (!(cost > 0)) {
      this.notice.set({ text: 'Стоимость часа простоя должна быть больше 0', error: true });
      return;
    }
    await this.save(
      { assets: d.assets.map((a) => (a.name === name ? { ...a, hourlyDowntimeCost: cost } : a)) },
      `Стоимость часа «${name}»: ${rub(cost)}. Текущие оценки связанных рисков пересчитаны.`,
    );
  }

  protected async addAsset(): Promise<void> {
    const { name, cost } = this.newAsset();
    const value = Number(cost.replace(/\s/g, '').replace(',', '.'));
    const d = this.dict.value()!;
    if (!name.trim() || !(value > 0)) {
      this.notice.set({
        text: 'Укажите название объекта и стоимость часа простоя больше 0',
        error: true,
      });
      return;
    }
    if (
      await this.save(
        { assets: [...d.assets, { name: name.trim(), hourlyDowntimeCost: value }] },
        `Объект «${name.trim()}» добавлен.`,
      )
    )
      this.newAsset.set({ name: '', cost: '' });
  }
}
