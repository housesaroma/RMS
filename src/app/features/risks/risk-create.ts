import { DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, required } from '@angular/forms/signals';
import { errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth';
import { NewRisk, Risk } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { RiskStatusChip } from '../../ui/risk-status';

@Component({
  selector: 'app-risk-create',
  imports: [FormField, FormRoot, Icon, RiskStatusChip],
  templateUrl: './risk-create.html',
  styleUrl: './risk-create.scss',
})
export class RiskCreate {
  private readonly ref = inject<DialogRef<Risk>>(DialogRef);
  private readonly api = inject(RisksApi);
  private readonly auth = inject(AuthService);

  protected readonly dict = this.api.dictionaries;
  protected readonly error = signal('');

  /** EMPLOYEE and OWNER pick a process of their own directorate; admin picks any. */
  protected readonly processes = computed(() => {
    const all = this.dict.value()?.processes ?? [];
    return this.auth.can('admin')
      ? all
      : all.filter((p) => p.directorate === this.auth.user()?.directorate);
  });

  protected readonly model = signal<NewRisk>(empty());
  protected readonly f = form(
    this.model,
    (p) => {
      required(p.name, { message: 'Укажите название риска' });
      maxLength(p.name, 200, { message: 'Не длиннее 200 символов' });
      required(p.description, { message: 'Опишите, что может произойти' });
      required(p.hazard, { message: 'Выберите опасность' });
      required(p.category, { message: 'Выберите категорию' });
      required(p.process, { message: 'Выберите процесс' });
    },
    {
      submission: {
        onInvalid: (f) => f().markAsTouched(),
        action: async () => {
          this.error.set('');
          try {
            this.ref.close(await this.api.create(this.model()));
          } catch (e) {
            this.error.set(errorMessage(e, 'Не удалось создать риск. Повторите попытку.'));
          }
          return undefined;
        },
      },
    },
  );

  protected readonly process = computed(() =>
    this.processes().find((p) => p.name === this.model().process),
  );

  protected close(): void {
    this.ref.close();
  }

  protected reset(): void {
    this.model.set(empty());
    this.f().reset();
    this.error.set('');
  }

  protected errorOf(field: { touched(): boolean; errors(): { message?: string }[] }): string {
    return field.touched() ? (field.errors()[0]?.message ?? '') : '';
  }
}

function empty(): NewRisk {
  return {
    name: '',
    description: '',
    hazard: '',
    category: '',
    process: '',
    asset: '',
    top: false,
  };
}
