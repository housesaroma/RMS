import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, required, validate } from '@angular/forms/signals';
import { errorMessage } from '../../core/api';
import { rub } from '../../core/format';
import { Dictionaries, Measure, MeasureStatus, RiskDetails } from '../../core/models';
import { approvalLevel, approverOf } from '../../core/risk-rules';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';

/** Statuses that hold the "one active measure per directorate" slot (analytics 11, rules 20–22). */
const SLOT: MeasureStatus[] = ['APPROVAL', 'APPROVED', 'PENDING', 'IN_PROGRESS'];

@Component({
  selector: 'app-measure-dialog',
  imports: [FormField, FormRoot, Icon],
  templateUrl: './measure-dialog.html',
  styleUrl: './dialog.scss',
})
export class MeasureDialog {
  private readonly ref = inject<DialogRef<RiskDetails>>(DialogRef);
  private readonly api = inject(RisksApi);
  private readonly data = inject<{ risk: RiskDetails; dict: Dictionaries; measure?: Measure }>(
    DIALOG_DATA,
  );
  /** Set when a draft measure is edited instead of created. */
  protected readonly measure = this.data.measure;

  protected readonly risk = this.data.risk;
  protected readonly dict = this.data.dict;
  protected readonly rub = rub;
  protected readonly error = signal('');

  protected readonly processes = [
    { name: this.risk.process, directorate: this.risk.directorate, primary: true },
    ...this.risk.secondary.map((p) => ({
      name: p.name,
      directorate: p.directorate,
      primary: false,
    })),
  ];

  protected readonly model = signal({
    title: this.measure?.title ?? '',
    description: this.measure?.description ?? '',
    process: this.measure?.process ?? this.risk.process,
    dueDate: this.measure?.dueDate ?? '',
    cost: this.measure ? this.measure.costPlanned.toLocaleString('ru-RU') : '',
  });
  protected readonly f = form(
    this.model,
    (p) => {
      required(p.title, { message: 'Укажите название меры' });
      maxLength(p.title, 200, { message: 'Не длиннее 200 символов' });
      required(p.dueDate, { message: 'Укажите срок' });
      required(p.cost, { message: 'Укажите плановую стоимость' });
      validate(p.cost, ({ value }) =>
        /^\d*$/.test(value().replace(/\s/g, ''))
          ? undefined
          : { kind: 'number', message: 'Только цифры, в рублях' },
      );
    },
    {
      submission: {
        onInvalid: (f) => f().markAsTouched(),
        action: async () => {
          this.error.set('');
          const m = this.model();
          const body = {
            title: m.title,
            description: m.description,
            process: m.process,
            dueDate: m.dueDate,
            costPlanned: this.costValue()!,
          };
          try {
            this.ref.close(
              await (this.measure
                ? this.api.updateMeasure(this.measure.id, body)
                : this.api.createMeasure(this.risk.id, body)),
            );
          } catch (e) {
            this.error.set(errorMessage(e, 'Не удалось сохранить меру. Повторите попытку.'));
          }
          return undefined;
        },
      },
    },
  );

  protected readonly costValue = computed(() => {
    const raw = this.model().cost.replace(/\s/g, '');
    return /^\d+$/.test(raw) ? Number(raw) : null;
  });

  /** Single-level approval: the highest reached threshold decides (analytics 13, §5.1). */
  protected readonly route = computed(() => {
    const cost = this.costValue();
    if (cost == null) return null;
    const t = this.dict.approval;
    const level = approvalLevel(cost, t);
    const next = level === 'OWNER' ? t.director : level === 'DIRECTOR' ? t.ceo : null;
    const bound = level === 'CEO' ? t.ceo : level === 'DIRECTOR' ? t.director : t.owner;
    return {
      level,
      head:
        level === 'NONE'
          ? 'Согласование не требуется'
          : level === 'CEO'
            ? 'Согласует генеральный директор (CEO)'
            : level === 'DIRECTOR'
              ? 'Согласует директор (DIRECTOR)'
              : 'Согласует владелец процесса (OWNER)',
      who: approverOf(level, this.model().process, this.dict),
      why:
        level === 'NONE'
          ? `${rub(cost)} ниже порога OWNER ${rub(t.owner)}`
          : `${rub(cost)} ≥ ${rub(bound)}${next != null ? ` и < ${rub(next)}` : ''}: уровень ${level}`,
    };
  });

  protected readonly segments = computed(() => {
    const t = this.dict.approval;
    return (['OWNER', 'DIRECTOR', 'CEO'] as const).map((code) => ({
      code,
      from: rub(t[code === 'OWNER' ? 'owner' : code === 'DIRECTOR' ? 'director' : 'ceo']),
      on: this.route()?.level === code,
    }));
  });

  protected readonly busy = computed(() => {
    const dir = this.processes.find((p) => p.name === this.model().process)?.directorate;
    const all = [
      { name: this.risk.process, directorate: this.risk.directorate },
      ...this.risk.secondary,
    ];
    return this.risk.measures.find(
      (m) => SLOT.includes(m.status) && all.find((p) => p.name === m.process)?.directorate === dir,
    );
  });

  protected formatCost(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    this.f.cost().value.set(digits ? Number(digits).toLocaleString('ru-RU') : '');
  }

  protected close(): void {
    this.ref.close();
  }
}
