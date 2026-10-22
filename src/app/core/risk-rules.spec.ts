import { DICTIONARIES, USERS } from './mock/db';
import { assess, chooseMode } from './mock/risks';
import { seedRisks } from './mock/seed';
import {
  approvalLevel,
  canAccept,
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
    expect(chooseMode(r, 'treat', IVANOVA, DICTIONARIES, '2026-10-22T10:05:00Z')).toBeNull();
    expect(canCreateMeasure(r, IVANOVA).ok).toBe(true);
    expect(canCreateMeasure(r, BELOV).ok).toBe(false); // RISK_SPECIALIST has no create_treatment
    expect(chooseMode(r, 'accept', ADMIN, DICTIONARIES, '2026-10-22T10:06:00Z')).toContain(
      'уже выбран',
    );
  });
});
