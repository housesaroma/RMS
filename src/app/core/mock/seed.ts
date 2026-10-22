import { Assessment, HistoryEvent, Measure, ResponseMode, RiskDetails } from '../models';
import { DICTIONARIES, PROCESS, ROWS, Row } from './db';

const ASSETS: Record<string, string> = {
  'R-0142': 'CI/CD-конвейер GitLab',
  'R-0121': 'CI/CD-конвейер GitLab',
  'R-0152': 'Серверная офиса Екатеринбург',
  'R-0151': 'Серверная офиса Екатеринбург',
};

// Active risks where the owner already chose to treat; the other active ones wait for a decision.
const TREATED = ['R-0142', 'R-0144', 'R-0150', 'R-0127'];

const at = (date: string, time: string, plusDays = 0) => {
  const d = new Date(`${date}T${time}:00`);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
};

function assessmentFor(row: Row, asset: string | null): Assessment {
  const [id, , , , , process, createdAt, l, i] = row;
  const cost = asset ? DICTIONARIES.assets.find((a) => a.name === asset)!.hourlyDowntimeCost : null;
  // A loss inside the impact level (1.3 × its lower bound); 40 h for the prototype's R-0142.
  const target = DICTIONARIES.impactThresholds[i - 1] * 1.3;
  const hours = cost ? (id === 'R-0142' ? 40 : Math.ceil(target / cost)) : null;
  return {
    likelihood: l,
    impact: i,
    score: l * i,
    lossAmount: cost ? hours! * cost : target,
    hourlyCost: cost,
    downtimeHours: hours,
    by: PROCESS.get(process)!.owner,
    byRole: 'Владелец процесса',
    at: at(createdAt, '16:05'),
  };
}

type Ev = [at: string, text: string, by: string, role: string, kind: HistoryEvent['kind']];
type Cm = [authorId: string, author: string, role: string, at: string, text: string];

// The card from the approved prototype.
const R0142 = {
  description:
    'Нестабильные раннеры сборки останавливают выпуск до 6 часов, релиз для банка-клиента сдвигается. Полный отказ конвейера останавливает выпуск всех команд до восстановления раннеров.',
  author: 'Соловьёв К. И.',
  authorPosition: 'DevOps-инженер',
  secondary: ['Работа с субподрядчиками'],
  // prettier-ignore
  measures: [
    { id: 'М-0091', title: 'Резервные раннеры сборки и кеш артефактов', description: 'Второй пул раннеров GitLab и общий кеш артефактов, чтобы сборки переключались без остановки выпуска', status: 'APPROVAL', process: 'Разработка ПО', dueDate: '2026-11-30', costPlanned: 380000, costActual: null, executor: null, sentAt: '2026-10-09T15:30:00.000Z', decidedAt: null, doneAt: null },
    { id: 'М-0089', title: 'Продление расширенной поддержки GitLab у вендора', description: 'Договор расширенной поддержки с партнёром GitLab: реакция на инцидент конвейера до 4 часов', status: 'IN_PROGRESS', process: 'Работа с субподрядчиками', dueDate: '2026-11-25', costPlanned: 45000, costActual: null, executor: 'Зайцев П. Н.', sentAt: '2026-09-23T08:00:00.000Z', decidedAt: '2026-09-24T07:30:00.000Z', doneAt: null },
    { id: 'М-0084', title: 'Обучение команды отладке пайплайнов CI', description: 'Диагностика падений сборок и быстрый перезапуск раннеров', status: 'DONE', process: 'Разработка ПО', dueDate: '2026-09-30', costPlanned: 28000, costActual: 26500, executor: 'Соловьёв К. И.', sentAt: '2026-09-17T08:00:00.000Z', decidedAt: '2026-09-17T12:00:00.000Z', doneAt: '2026-09-30T14:05:00.000Z' },
  ] as Measure[],
  // prettier-ignore
  history: [
    ['2026-10-09T15:30', 'М-0091 отправлена на согласование: 380 000 ₽ ≥ 100 000 ₽, уровень CEO', 'Иванова Е. С.', 'Владелец процесса', 'approval'],
    ['2026-10-06T08:15', 'Создана мера М-0091 «Резервные раннеры сборки и кеш артефактов»', 'Иванова Е. С.', 'Владелец процесса', 'measure'],
    ['2026-09-30T14:05', 'М-0084 выполнена: факт 26 500 ₽ при плане 28 000 ₽', 'Иванова Е. С.', 'Владелец процесса', 'done'],
    ['2026-09-24T07:30', 'М-0089 согласована на уровне OWNER (45 000 ₽) и передана к выполнению, исполнитель Зайцев П. Н.', 'Сергеев В. И.', 'Владелец процесса «Работа с субподрядчиками»', 'approval'],
    ['2026-09-16T06:50', 'Созданы меры М-0084 и М-0089 в статусе «Черновик»', 'Белов А. Н.', 'Риск-менеджер', 'measure'],
  ] as Ev[],
  // prettier-ignore
  comments: [
    ['U-008', 'Иванова Е. С.', 'Владелец процесса', '2026-10-05T08:20', 'Вендор подтвердил конфигурацию резервных раннеров под наш GitLab. Отправлю меру на согласование, как только DevOps-команда проверит спецификацию.'],
    ['U-090', 'Сергеев В. И.', 'Владелец процесса «Работа с субподрядчиками»', '2026-10-07T06:05', 'Условия поддержки с вендором согласованы, осталось подписать SLA-приложение к договору. Подпишем до 25.10.'],
    ['U-003', 'Белов А. Н.', 'Риск-менеджер', '2026-10-10T11:40', 'Беру М-0091 на рассмотрение на уровне CEO: сравниваю 380 000 ₽ с последствиями одного отказа в 2 400 000 ₽.'],
  ] as Cm[],
};

const utc = (s: string) => new Date(s + ':00Z').toISOString();

/** Registry rows expanded into full risk cards for the in-memory backend. */
export function seedRisks(): RiskDetails[] {
  return ROWS.map((row) => {
    const [id, iso, name, hazard, category, process, createdAt, l, i, status, top] = row;
    const p = PROCESS.get(process)!;
    const asset = ASSETS[id] ?? null;
    const a = l > 0 && i > 0 ? assessmentFor(row, asset) : null;
    const reassess = status === 'REASSESSMENT';
    const mode: ResponseMode | null =
      status === 'ACCEPTED' || status === 'CLOSED'
        ? 'accept'
        : status === 'ACTIVE' && TREATED.includes(id)
          ? 'treat'
          : null;
    const proto = id === 'R-0142' ? R0142 : null;
    const author = proto?.author ?? 'Голубев А. И.';
    const created = at(createdAt, '09:40');
    const modeAt = at(createdAt, '10:12', 3);

    const history: HistoryEvent[] = [
      {
        at: created,
        text: `Риск зарегистрирован в статусе «Черновик»${top ? ' и отмечен как топ-риск' : ''}`,
        by: author,
        role: 'Сотрудник',
        kind: 'create',
      },
    ];
    if (a) {
      history.unshift({
        at: a.at,
        text: `Первичная оценка: сумма последствий ${a.lossAmount.toLocaleString('ru-RU')} ₽, тяжесть ${i}, R = ${l} × ${i} = ${l * i}. Статус «Активен»`,
        by: a.by,
        role: a.byRole,
        kind: 'assess',
      });
    }
    if (a && (mode || reassess)) {
      history.unshift({
        at: modeAt,
        text: `Выбран режим «${mode === 'accept' ? 'Принять' : 'Обработать'}»`,
        by: a.by,
        role: a.byRole,
        kind: 'mode',
      });
    }
    if (reassess) {
      history.unshift({
        at: at(createdAt, '12:00', 20),
        text: 'Цикл мер завершён: текущая оценка деактивирована, риск переведён в «Ожидает переоценки»',
        by: 'Система',
        role: 'автоматически',
        kind: 'system',
      });
    }
    if (proto) {
      history.unshift(
        ...proto.history.map(([when, text, by, role, kind]) => ({
          at: utc(when),
          text,
          by,
          role,
          kind,
        })),
      );
    }

    return {
      id,
      iso,
      name,
      description:
        proto?.description ??
        `${name}. Риск выявлен в процессе «${process}», источник опасности: ${hazard.toLowerCase()}.`,
      hazard,
      category,
      process,
      directorate: p.directorate,
      owner: p.owner,
      asset,
      createdAt,
      createdAtTime: created,
      likelihood: reassess || !a ? null : l,
      impact: reassess || !a ? null : i,
      status,
      top,
      author,
      authorPosition: proto?.authorPosition ?? 'Разработчик (backend)',
      secondary: (proto?.secondary ?? []).map((n) => PROCESS.get(n)!),
      responseMode: reassess ? null : mode,
      modeAt: mode && !reassess ? modeAt : null,
      assessment: reassess ? null : a,
      previous: reassess ? a : null,
      measures: proto?.measures ?? [],
      history,
      comments: (proto?.comments ?? []).map(([authorId, by, role, when, text], k) => ({
        id: `C-${id}-${k}`,
        authorId,
        author: by,
        role,
        at: utc(when),
        text,
      })),
      related: [],
    };
  });
}
