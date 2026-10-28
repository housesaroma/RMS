import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { errorMessage } from '../../core/api';
import { Process, RiskDetails } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';

export interface ModeDialogData {
  risk: RiskDetails;
  mode: 'split' | 'transfer';
  processes: Process[];
}

/** Split: the risk spreads over several processes, one stays primary. Transfer: it moves to another process. */
@Component({
  selector: 'app-mode-dialog',
  imports: [Icon],
  template: `
    <div class="dialog body">
      <div class="head">
        <div class="grow">
          <h2 id="md-title">{{ split ? 'Разделить риск' : 'Передать риск' }}</h2>
          <p class="muted lead">
            @if (split) {
              Риск {{ risk.id }} затронет несколько процессов. Меры создаются по каждому процессу,
              основной процесс отвечает за риск.
            } @else {
              Риск {{ risk.id }} перейдёт в другой процесс. Текущая оценка уйдёт в историю, новый
              владелец оценит риск заново.
            }
          </p>
        </div>
        <button type="button" class="icon-btn btn--ghost" aria-label="Закрыть окно" (click)="close()">
          <ui-icon name="close" [size]="16" />
        </button>
      </div>
      <form class="form" (submit)="submit($event)">
        @if (split) {
          <fieldset class="field fieldset">
            <legend class="muted">Процессы риска * (не меньше двух)</legend>
            @for (p of data.processes; track p.name) {
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="chosen().includes(p.name)"
                  (change)="toggle(p.name, $any($event.target).checked)"
                />
                <span>{{ p.name }} <span class="muted">· {{ p.directorate }}</span></span>
              </label>
            }
          </fieldset>
          <label class="field">
            <span class="muted">Основной процесс *</span>
            <span class="select">
              <select class="input" (change)="primary.set($any($event.target).value)">
                @for (n of chosen(); track n) {
                  <option [value]="n" [selected]="n === primary()">{{ n }}</option>
                }
              </select>
            </span>
          </label>
        } @else {
          <label class="field">
            <span class="muted">Новый процесс *</span>
            <span class="select">
              <select class="input" (change)="target.set($any($event.target).value)">
                <option value="" [selected]="!target()">Выберите процесс</option>
                @for (p of others; track p.name) {
                  <option [value]="p.name" [selected]="p.name === target()">
                    {{ p.name }} · {{ p.directorate }}
                  </option>
                }
              </select>
            </span>
          </label>
        }
        @if (error()) {
          <div class="field__error strong" role="alert">{{ error() }}</div>
        }
        <div class="buttons">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Отмена</button>
          <button type="submit" class="btn btn--sm" [disabled]="!valid() || busy()">
            {{ busy() ? 'Сохраняем…' : split ? 'Разделить' : 'Передать' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrl: './dialog.scss',
})
export class ModeDialog {
  private readonly ref = inject<DialogRef<RiskDetails>>(DialogRef);
  private readonly api = inject(RisksApi);
  protected readonly data = inject<ModeDialogData>(DIALOG_DATA);
  protected readonly risk = this.data.risk;
  protected readonly split = this.data.mode === 'split';

  private readonly linked = [this.risk.process, ...this.risk.secondary.map((s) => s.name)];
  protected readonly others = this.data.processes.filter((p) => !this.linked.includes(p.name));
  protected readonly chosen = signal(this.linked.filter((n) => this.data.processes.some((p) => p.name === n)));
  protected readonly primary = signal(this.risk.process);
  protected readonly target = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly valid = computed(() =>
    this.split ? this.chosen().length >= 2 && this.chosen().includes(this.primary()) : !!this.target(),
  );

  protected toggle(name: string, on: boolean): void {
    const next = on ? [...this.chosen(), name] : this.chosen().filter((n) => n !== name);
    this.chosen.set(next);
    if (!next.includes(this.primary())) this.primary.set(next[0] ?? '');
  }

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    try {
      this.ref.close(
        await this.api.chooseMode(
          this.risk.id,
          this.data.mode,
          this.split ? { processes: this.chosen(), primary: this.primary() } : { process: this.target() },
        ),
      );
    } catch (err) {
      this.error.set(errorMessage(err));
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
