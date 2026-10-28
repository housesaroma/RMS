import { DICTIONARIES, USERS } from './mock/db';
import { transitionMeasure } from './mock/measures';
import { assess, chooseMode } from './mock/risks';
import { seedRisks } from './mock/seed';
import {
  approvalLevel,
  canAccept,
  canMeasure,
  canAssess,
  canCreateMeasure,
  canTreat,
  impactOf,
  lossOf,
} from './risk-rules';

const user = (id: string) => USERS.find((u) => u.id === id)!;
const risk = (id: string) => seedRisks().find((r) => r.id === id)!;
const IVANOVA = user('U-008'),
  PETROV = user('U-005'),
  BELOV = user('U-003'),
  ADMIN = user('U-001');

describe('risk rules', () => {
  it('computes loss with HALF_UP kopecks and impact from money thresholds', () => {
    expect(lossOf({ likelihood: 1, weeks: 0, days: 1, hours: 16 }, 60000)).toEqual({
      hours: 40,
      loss: 2400000,
    });
    expect(lossOf({ likelihood: 1, hours: 0.333 }, 100)).toEqual({ hours: 0.333, loss: 33.3 });
    expect(lossOf({ likelihood: 1, lossAmount: 12.345 }, null).loss).toBe(12.35);
    const t = DICTIONARIES.impactThresholds;
    expect([0, 9999.99, 10000, 199999, 200000, 1000000].map((x) => impactOf(x, t))).toEqual([
      0, 0, 1, 2, 3, 5,
    ]);
  });

  it('picks the single highest approval level by planned cost', () => {
    const t = DICTIONARIES.approval;
    expect([0, 49999, 50000, 99999, 100000].map((c) => approvalLevel(c, t))).toEqual([
      'OWNER',
      'OWNER',
      'DIRECTOR',
      'DIRECTOR',
      'CEO',
    ]);
  });

  it('lets only the primary process owner or admin assess', () => {
    const draft = risk('R-0147');
    expect(canAssess(draft, IVANOVA, DICTIONARIES).ok).toBe(true);
    expect(canAssess(draft, PETROV, DICTIONARIES).why).toContain('Иванова');
    expect(canAssess(draft, ADMIN, DICTIONARIES).ok).toBe(true);
    expect(canAssess(risk('R-0142'), IVANOVA, DICTIONARIES).ok).toBe(false);
  });

  it('routes acceptance to the level of R and blocks TREATMENT_REQUIRED', () => {
    expect(canAccept(risk('R-0129'), IVANOVA, DICTIONARIES).ok).toBe(true); // R = 8, OWNER
    expect(canAccept(risk('R-0138'), IVANOVA, DICTIONARIES).ok).toBe(false); // R = 12, DIRECTOR
    expect(canAccept(risk('R-0138'), PETROV, DICTIONARIES).ok).toBe(true);
    const tr = risk('R-0121'); // R = 10 OWNER, owned by Ким
    expect(canAccept(tr, BELOV, DICTIONARIES).ok).toBe(false);
    const treated = risk('R-0142');
    expect(canAccept(treated, ADMIN, DICTIONARIES).why).toContain('Режим цикла уже выбран');
  });

  it('runs assess → treat → measure gate as one cycle', () => {
    const r = risk('R-0147');
    expect(
      assess(
        r,
        { likelihood: 3, lossAmount: 650000 },
        IVANOVA,
        DICTIONARIES,
        '2026-10-22T10:00:00Z',
      ),
    ).toBeNull();
    expect(r).toMatchObject({ status: 'ACTIVE', likelihood: 3, impact: 4, responseMode: null });
    expect(canCreateMeasure(r, IVANOVA).ok).toBe(false);
    expect(canTreat(r, PETROV, DICTIONARIES).ok).toBe(false);
    expect(chooseMode(r, { mode: 'treat' }, IVANOVA, DICTIONARIES, '2026-10-22T10:05:00Z')).toBeNull();
    expect(canCreateMeasure(r, IVANOVA).ok).toBe(true);
    expect(canCreateMeasure(r, BELOV).ok).toBe(false); // RISK_SPECIALIST has no create_treatment
    expect(chooseMode(r, { mode: 'accept' }, ADMIN, DICTIONARIES, '2026-10-22T10:06:00Z')).toContain(
      'уже выбран',
    );
  });

  it('splits a risk over processes and transfers it to a new owner', () => {
    const r = risk('R-0147');
    assess(r, { likelihood: 3, lossAmount: 650000 }, IVANOVA, DICTIONARIES, '2026-10-22T10:00:00Z');
    const [other] = DICTIONARIES.processes.filter((p) => p.name !== r.process);
    expect(chooseMode(r, { mode: 'split', processes: [r.process] }, IVANOVA, DICTIONARIES, 't')).toContain(
      'двух',
    );
    expect(
      chooseMode(r, { mode: 'split', processes: [r.process, other.name], primary: other.name }, IVANOVA, DICTIONARIES, 't'),
    ).toBeNull();
    expect(r).toMatchObject({ process: other.name, responseMode: 'split' });
    expect(r.secondary.map((s) => s.name)).toHaveLength(1);
    expect(canCreateMeasure(r, IVANOVA).ok).toBe(true);

    const t = risk('R-0147');
    assess(t, { likelihood: 3, lossAmount: 650000 }, IVANOVA, DICTIONARIES, '2026-10-22T10:00:00Z');
    expect(chooseMode(t, { mode: 'transfer', process: t.process }, IVANOVA, DICTIONARIES, 't')).toContain('уже связан');
    expect(chooseMode(t, { mode: 'transfer', process: other.name }, IVANOVA, DICTIONARIES, 't')).toBeNull();
    expect(t).toMatchObject({ status: 'REASSESSMENT', process: other.name, assessment: null, responseMode: null });
  });

  it('runs a measure through approval, handover and finish with the slot rule', () => {
    const r = risk('R-0142');
    const now = '2026-10-22T10:00:00Z';
    const m91 = r.measures.find((m) => m.id === 'М-0091')!;
    const m97 = r.measures.find((m) => m.id === 'М-0097')!;
    // CEO level: the risk manager decides, the process owner cannot.
    expect(canMeasure('approve', m91, r, IVANOVA, DICTIONARIES).ok).toBe(false);
    expect(
      transitionMeasure(r, 'М-0091', { action: 'approve' }, BELOV, DICTIONARIES, now),
    ).toBeNull();
    // The Разработка slot is held by М-0091, so the draft cannot be sent.
    expect(canMeasure('send', m97, r, IVANOVA, DICTIONARIES).why).toContain('М-0091');
    expect(
      transitionMeasure(
        r,
        'М-0091',
        { action: 'handover', executor: 'Зайцев П. Н.' },
        IVANOVA,
        DICTIONARIES,
        now,
      ),
    ).toContain('исполнителя');
    expect(
      transitionMeasure(
        r,
        'М-0091',
        { action: 'handover', executor: 'Голубев А. И.' },
        IVANOVA,
        DICTIONARIES,
        now,
      ),
    ).toBeNull();
    expect(
      transitionMeasure(r, 'М-0091', { action: 'start' }, IVANOVA, DICTIONARIES, now),
    ).toBeNull();
    expect(
      transitionMeasure(r, 'М-0091', { action: 'finish' }, IVANOVA, DICTIONARIES, now),
    ).toContain('стоимость');
    expect(
      transitionMeasure(
        r,
        'М-0091',
        { action: 'finish', costActual: 391500 },
        IVANOVA,
        DICTIONARIES,
        now,
      ),
    ).toBeNull();
    expect(m91).toMatchObject({ status: 'DONE', costActual: 391500, executor: 'Голубев А. И.' });
    expect(canMeasure('send', m97, r, IVANOVA, DICTIONARIES).ok).toBe(true);
    expect(r.status).toBe('ACTIVE'); // М-0089 is still in progress
  });

  it('rejects with a reason, revokes only as admin and ends the cycle on the last measure', () => {
    const now = '2026-10-22T10:00:00Z';
    const r = risk('R-0149');
    expect(
      transitionMeasure(r, 'М-0087', { action: 'reject', reason: ' ' }, BELOV, DICTIONARIES, now),
    ).toContain('причину');
    expect(
      transitionMeasure(r, 'М-0087', { action: 'revoke', reason: 'x' }, BELOV, DICTIONARIES, now),
    ).toContain('администратор');
    expect(
      transitionMeasure(
        r,
        'М-0087',
        { action: 'reject', reason: 'Нужно два КП' },
        BELOV,
        DICTIONARIES,
        now,
      ),
    ).toBeNull();
    expect(r.measures[0]).toMatchObject({ status: 'DRAFT' });
    expect(r.measures[0].requests[0]).toMatchObject({ status: 'REJECTED', reason: 'Нужно два КП' });

    const last = risk('R-0144');
    expect(
      transitionMeasure(last, 'М-0090', { action: 'cancel' }, ADMIN, DICTIONARIES, now),
    ).toBeNull();
    expect(last).toMatchObject({ status: 'REASSESSMENT', assessment: null, responseMode: null });
    expect(last.previous?.score).toBe(20);
  });
});
