import { Component, computed, inject, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { downloadCsv, parseCsv } from '../../core/csv';
import { date } from '../../core/format';
import { ImportResult, ImportType } from '../../core/models';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';

const TYPES: { key: ImportType; name: string; desc: string; example: string[] }[] = [
  {
    key: 'risks',
    name: 'Риски',
    desc: 'Черновики рисков по процессам; оценку потом проводит владелец процесса.',
    example: [
      'Отказ сервера сборки',
      'Сборки встают на день',
      'Отказ инфраструктуры',
      'Операционные',
      'Релизы и деплой',
    ],
  },
  {
    key: 'users',
    name: 'Пользователи',
    desc: 'Учётные записи с ролью; каждому уйдёт письмо с временным паролем.',
    example: [
      'Сидоров Пётр Иванович',
      'p.sidorov@artsofte.example',
      'Аналитик',
      'Разработка',
      'EMPLOYEE',
    ],
  },
  {
    key: 'assets',
    name: 'Объекты',
    desc: 'Объекты со стоимостью часа простоя для расчёта суммы последствий.',
    example: ['Сервер мониторинга', '12000'],
  },
];

@Component({
  selector: 'app-settings-import',
  imports: [PageHeader, SettingsTabs, Icon],
  templateUrl: './import.html',
  styleUrl: './settings.scss',
  styles: `
    .steps {
      display: flex;
      gap: 8px;
      counter-reset: step;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--fs-sm);
      color: var(--muted);
    }
    .step b {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--chip-bg);
      font-weight: 500;
    }
    .step.on {
      color: var(--text);
    }
    .step.on b {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    .types {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .type {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px;
      border-radius: 20px;
      border: 1px solid transparent;
      background: var(--inner-bg);
      text-align: left;
      cursor: pointer;
    }
    .type[aria-checked='true'] {
      border-color: var(--accent);
    }
    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 28px;
      border-radius: 20px;
      border: 1.5px dashed var(--line);
      text-align: center;
    }
  `,
})
export class Import {
  private readonly api = inject(AdminApi);
  protected readonly note = noteOf('import');
  protected readonly history = this.api.imports();
  protected readonly types = TYPES;
  protected readonly date = date;

  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly type = signal<ImportType>('risks');
  protected readonly header = signal<string[]>([]);
  protected readonly file = signal('');
  protected readonly rows = signal<string[][]>([]);
  protected readonly parseError = signal('');
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly typeName = computed(() => TYPES.find((t) => t.key === this.type())!.name);

  protected async next(): Promise<void> {
    this.header.set(await this.api.template(this.type()));
    this.step.set(2);
  }

  protected downloadTemplate(): void {
    downloadCsv(`template-${this.type()}`, this.header(), [
      TYPES.find((t) => t.key === this.type())!.example,
    ]);
  }

  protected async pick(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.parseError.set('');
    if (!/\.csv$/i.test(f.name)) {
      this.parseError.set('Нужен файл CSV, сохранённый из шаблона');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      this.parseError.set('Файл больше 2 МБ');
      return;
    }
    const all = parseCsv(await f.text());
    const head = all[0]?.map((x) => x.trim()) ?? [];
    if (head.join('|') !== this.header().join('|')) {
      this.parseError.set(
        `Заголовок не совпадает с шаблоном. Ожидается: ${this.header().join('; ')}`,
      );
      return;
    }
    if (all.length < 2) {
      this.parseError.set('В файле нет строк с данными');
      return;
    }
    this.file.set(f.name);
    this.rows.set(all.slice(1));
  }

  protected async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.result.set(await this.api.runImport(this.type(), this.file(), this.rows()));
      this.step.set(3);
      this.history.reload();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected downloadErrors(): void {
    const r = this.result();
    if (r)
      downloadCsv(
        'import-errors',
        ['Строка', 'Ошибка'],
        r.errors.map((e) => [e.row, e.message]),
      );
  }

  protected restart(): void {
    this.step.set(1);
    this.file.set('');
    this.rows.set([]);
    this.result.set(null);
    this.parseError.set('');
  }
}
