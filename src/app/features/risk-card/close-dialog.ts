import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { errorMessage } from '../../core/api';
import { CLOSE_REASONS, RiskDetails } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';

/** Closing a risk: the reason is required, the risk goes to the archive. */
@Component({
  selector: 'app-close-dialog',
  imports: [Icon],
  template: `
    <div class="dialog body">
      <div class="head">
        <div class="grow">
          <h2 id="cl-title">Закрыть риск</h2>
          <p class="muted lead">
            {{ risk.id }} «{{ risk.name }}» уйдёт в архив. Текущая оценка сохранится в истории,
            вернуть риск можно из архива.
          </p>
        </div>
        <button
          type="button"
          class="icon-btn btn--ghost"
          aria-label="Закрыть окно"
          (click)="close()"
        >
          <ui-icon name="close" [size]="16" />
        </button>
      </div>
      <form class="form" (submit)="submit($event)">
        <label class="field">
          <span class="muted">Причина закрытия *</span>
          <span class="select">
            <select
              class="input"
              [value]="reason()"
              (change)="reason.set($any($event.target).value)"
            >
              <option value="">Выберите причину</option>
              @for (r of reasons; track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
          </span>
        </label>
        <label class="field">
          <span class="muted">Комментарий{{ reason() === 'Другое' ? ' *' : '' }}</span>
          <textarea
            class="input"
            rows="3"
            maxlength="1000"
            [value]="comment()"
            (input)="comment.set($any($event.target).value)"
          ></textarea>
        </label>
        @if (error()) {
          <div class="field__error strong" role="alert">{{ error() }}</div>
        }
        <div class="buttons">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Отмена</button>
          <button type="submit" class="btn btn--sm" [disabled]="!valid() || busy()">
            {{ busy() ? 'Закрываем…' : 'Закрыть риск' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrl: './dialog.scss',
})
export class CloseDialog {
  private readonly ref = inject<DialogRef<RiskDetails>>(DialogRef);
  private readonly api = inject(RisksApi);
  protected readonly risk = inject<RiskDetails>(DIALOG_DATA);

  protected readonly reasons = CLOSE_REASONS;
  protected readonly reason = signal('');
  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected valid(): boolean {
    return !!this.reason() && (this.reason() !== 'Другое' || !!this.comment().trim());
  }

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    try {
      this.ref.close(await this.api.close(this.risk.id, this.reason(), this.comment()));
    } catch (err) {
      this.error.set(errorMessage(err));
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
