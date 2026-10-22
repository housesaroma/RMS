import {
  ApprovalLevel,
  ApprovalRequest,
  Assessment,
  HistoryEvent,
  Measure,
  ResponseMode,
  RiskDetails,
} from '../models';
import { approvalLevel } from '../risk-rules';
import { DICTIONARIES, PROCESS, ROWS, Row } from './db';

const ASSETS: Record<string, string> = {
  'R-0142': 'CI/CD-конвейер GitLab',
  'R-0121': 'CI/CD-конвейер GitLab',
  'R-0152': 'Серверная офиса Екатеринбург',
  'R-0151': 'Серверная офиса Екатеринбург',
};

const CLOSED_REASONS = [
  'Меры выполнены',
  'Риск неактуален',
  'Меры выполнены',
  'Объединён с другим риском',
];

// Active risks where the owner already chose to treat; the other active ones wait for a decision.
const TREATED = ['R-0142', 'R-0144', 'R-0150', 'R-0127', 'R-0148', 'R-0097', 'R-0136', 'R-0149'];

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
    at: at(createdAt, '16:05', 3),
  };
}

type MRow = [
  id: string,
  title: string,
  riskId: string,
  process: string,
  status: Measure['status'],
  due: string,
  plan: number,
  fact: number | null,
  executor: string,
  author: string,
  sent: string,
  decided: string,
  done: string,
  note?: string,
];

// Measures from the approved «Меры» prototype; dates are local times.
// prettier-ignore
const MROWS: MRow[] = [
  ['М-0098', 'Дежурная линия поддержки 24/7 для ключевого клиента', 'R-0148', 'Поддержка клиентов по SLA', 'APPROVAL', '2026-11-20', 36000, null, '', 'Гусева Т. В.', '2026-10-11T09:20', '', ''],
  ['М-0097', 'Мониторинг и автоперезапуск раннеров сборки', 'R-0142', 'Разработка ПО', 'DRAFT', '2026-12-15', 72000, null, '', 'Иванова Е. С.', '', '', ''],
  ['М-0096', 'Актуализация регрессионного набора автотестов', 'R-0097', 'Тестирование и приёмка', 'APPROVED', '2026-10-20', 18500, null, '', 'Лебедева А. С.', '2026-10-07T10:15', '2026-10-08T11:00', ''],
  ['М-0095', 'Резерв облачных мощностей на пиковый сезон', 'R-0150', 'Инфраструктура и ЦОД', 'IN_PROGRESS', '2026-10-31', 160000, null, 'Тарасов И. Н.', 'Мельников О. Д.', '2026-10-03T09:00', '2026-10-05T12:30', ''],
  ['М-0094', 'Программа удержания и найм двух senior-разработчиков', 'R-0127', 'Подбор и удержание', 'APPROVAL', '2026-11-15', 64000, null, '', 'Захарова М. Ю.', '2026-10-09T11:05', '', ''],
  ['М-0093', 'Страхование дебиторской задолженности заказчиков', 'R-0136', 'Казначейство', 'IN_PROGRESS', '2026-10-05', 85000, null, 'Ковалёва Т. С.', 'Никитина Л. Г.', '2026-09-23T10:00', '2026-09-25T15:00', ''],
  ['М-0092', 'Пилот отечественных аналогов зарубежных лицензий', 'R-0139', 'Закупка лицензий ПО', 'DONE', '2026-09-30', 40000, 38200, 'Орлова Н. П.', 'Орлова Н. П.', '2026-09-12T10:00', '2026-09-14T10:00', '2026-09-29T17:00'],
  ['М-0091', 'Резервные раннеры сборки и кеш артефактов', 'R-0142', 'Разработка ПО', 'APPROVAL', '2026-11-30', 380000, null, '', 'Иванова Е. С.', '2026-10-09T18:30', '', ''],
  ['М-0090', 'Резервный субподрядчик для мобильной разработки', 'R-0144', 'Работа с субподрядчиками', 'PENDING', '2026-11-15', 210000, null, 'Сергеев В. И.', 'Сергеев В. И.', '2026-10-01T09:00', '2026-10-03T16:00', ''],
  ['М-0089', 'Продление расширенной поддержки GitLab у вендора', 'R-0142', 'Работа с субподрядчиками', 'IN_PROGRESS', '2026-11-25', 45000, null, 'Зайцев П. Н.', 'Белов А. Н.', '2026-09-23T11:00', '2026-09-24T10:30', ''],
  ['М-0088', 'Перераспределение квот между облачными проектами', 'R-0150', 'Инфраструктура и ЦОД', 'HOLD', '2026-10-02', 15000, null, 'Тарасов И. Н.', 'Мельников О. Д.', '2026-09-23T09:00', '2026-09-25T09:30', ''],
  ['М-0087', 'Газовое пожаротушение в серверной офиса', 'R-0149', 'Инфраструктура и ЦОД', 'APPROVAL', '2026-12-31', 1240000, null, '', 'Мельников О. Д.', '2026-10-08T10:40', '', ''],
  ['М-0084', 'Обучение команды отладке пайплайнов CI', 'R-0142', 'Разработка ПО', 'DONE', '2026-09-30', 28000, 26500, 'Соловьёв К. И.', 'Белов А. Н.', '2026-09-17T11:00', '2026-09-18T15:00', '2026-09-30T17:05'],
  ['М-0083', 'Ротация ключей доступа и сканер секретов в репозиториях', 'R-0133', 'Релизы и деплой', 'DONE', '2026-10-03', 310000, 296400, 'Иванова Е. С.', 'Ким Р. А.', '2026-09-10T10:00', '2026-09-12T13:00', '2026-10-03T16:00'],
  ['М-0078', 'Резервный ЦОД и георепликация бэкапов', 'R-0109', 'Защита данных', 'CANCELLED', '2027-03-31', 640000, null, 'Кравцов А. Л.', 'Волков Д. Е.', '2026-08-12T10:00', '2026-08-15T12:00', '', 'Риск принят, мера отменена владельцем процесса'],
  ['М-0071', 'Нагрузочное тестирование платёжного модуля', 'R-0097', 'Тестирование и приёмка', 'CANCELLED', '2026-10-15', 95000, null, '', 'Лебедева А. С.', '2026-09-18T10:00', '2026-09-20T12:00', '', 'дублирует нагрузочные тесты эквайера'],
];

const local = (s: string) =>
  s ? new Date(s.length === 10 ? s + 'T12:00:00' : s + ':00').toISOString() : null;

function approverName(level: string, process: string): string {
  const p = PROCESS.get(process)!;
  if (level === 'CEO') return process === 'Инфраструктура и ЦОД' ? 'Белов А. Н.' : DICTIONARIES.ceo;
  if (level === 'DIRECTOR') return DICTIONARIES.directors[p.directorate];
  return p.owner;
}

const MEASURES = MROWS.map((row): Measure & { riskId: string } => {
  const [
    id,
    title,
    riskId,
    process,
    status,
    due,
    plan,
    fact,
    executor,
    author,
    sent,
    decided,
    done,
    note,
  ] = row;
  const level = approvalLevel(plan, DICTIONARIES.approval) as Exclude<ApprovalLevel, 'NONE'>;
  const requests: ApprovalRequest[] = [];
  if (sent) {
    const base = { level, sentAt: local(sent)!, sentBy: author };
    if (status === 'APPROVAL')
      requests.push({
        ...base,
        status: 'APPROVAL',
        decidedAt: null,
        decidedBy: null,
        reason: null,
      });
    else if (id === 'М-0071')
      requests.push({
        ...base,
        status: 'REVOKED',
        decidedAt: local(decided),
        decidedBy: 'Тихонов М. О.',
        reason: note ?? null,
      });
    else
      requests.push({
        ...base,
        status: 'APPROVED',
        decidedAt: local(decided),
        decidedBy: approverName(level, process),
        reason: null,
      });
    if (id === 'М-0093')
      requests.push({
        ...base,
        sentAt: local('2026-09-18T10:00')!,
        status: 'REJECTED',
        decidedAt: local('2026-09-22T12:00'),
        decidedBy: approverName(level, process),
        reason: 'нужен расчёт в сравнении с факторингом',
      });
  }
  return {
    id,
    riskId,
    title,
    description: note && id !== 'М-0071' ? note : '',
    status,
    process,
    dueDate: due,
    costPlanned: plan,
    costActual: fact,
    executor: executor || null,
    author,
    sentAt: local(sent),
    decidedAt: local(decided),
    doneAt: local(done),
    requests,
  };
});

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
    const closed = status === 'CLOSED';
    // A closed risk keeps its last assessment only as history.
    const noCurrent = reassess || closed;
    const closeIdx = ROWS.filter((x) => x[9] === 'CLOSED').findIndex((x) => x[0] === id);
    const closedAt = closed ? at(createdAt, '17:30', 40) : null;
    const mode: ResponseMode | null =
      status === 'ACCEPTED' || status === 'CLOSED'
        ? 'accept'
        : status === 'ACTIVE' && TREATED.includes(id)
          ? 'treat'
          : null;
    const proto = id === 'R-0142' ? R0142 : null;
    const author = proto?.author ?? 'Голубев А. И.';
    const created = at(createdAt, '09:40');
    const modeAt = at(createdAt, '10:12', 5);

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
    if (closed) {
      history.unshift({
        at: closedAt!,
        text: `Риск закрыт. Причина: ${CLOSED_REASONS[closeIdx % CLOSED_REASONS.length]}`,
        by: p.owner,
        role: 'Владелец процесса',
        kind: 'system',
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
      closedAt,
      closeReason: closed ? CLOSED_REASONS[closeIdx % CLOSED_REASONS.length] : null,
      closedBy: closed ? p.owner : null,
      likelihood: noCurrent || !a ? null : l,
      impact: noCurrent || !a ? null : i,
      status,
      top,
      author,
      authorPosition: proto?.authorPosition ?? 'Разработчик (backend)',
      secondary: (proto?.secondary ?? []).map((n) => PROCESS.get(n)!),
      responseMode: noCurrent ? null : mode,
      modeAt: mode && !noCurrent ? modeAt : null,
      assessment: noCurrent ? null : a,
      previous: noCurrent ? a : null,
      measures: MEASURES.filter((m) => m.riskId === id).map(({ riskId: _, ...m }) => m),
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
