import { RiskQuery } from '../models';
import { DICTIONARIES, RISKS, USERS } from './db';
import { createRisk, filterRisks, pageRisks, validateNewRisk } from './risks';

const q = (over: Partial<RiskQuery> = {}): RiskQuery => ({
  tab: 'all',
  q: '',
  directorate: '',
  category: '',
  owner: '',
  from: '',
  to: '',
  ceo: false,
  sort: '',
  page: 1,
  ...over,
});
const ids = (over: Partial<RiskQuery>) =>
  filterRisks(RISKS, q(over), DICTIONARIES).map((r) => r.id);
const user = (id: string) => USERS.find((u) => u.id === id)!;

describe('mock risk registry', () => {
  it('keeps closed risks out and counts tabs over the whole registry', () => {
    const page = pageRisks(RISKS, q({ tab: 'DRAFT', page: 1 }), DICTIONARIES);
    expect(ids({})).not.toContain('R-0118');
    expect(page.counts.CLOSED).toBe(8);
    expect(page.counts.all).toBe(RISKS.length - 8);
    expect(page.total).toBe(page.counts.DRAFT);
  });

  it('filters by text, CEO level and date range', () => {
    expect(ids({ q: 'r-0142' })).toEqual(['R-0142']);
    expect(
      ids({ ceo: true }).every((id) => {
        const r = RISKS.find((x) => x.id === id)!;
        return r.likelihood! * r.impact! >= 16;
      }),
    ).toBe(true);
    expect(ids({ from: '2026-10-01' })).toEqual(['R-0153', 'R-0152']);
  });

  it('sorts by score and always puts unassessed risks last', () => {
    const asc = filterRisks(RISKS, q({ sort: 'asc' }), DICTIONARIES);
    const scored = asc.filter((r) => r.likelihood);
    expect(asc.slice(scored.length).every((r) => !r.likelihood)).toBe(true);
    expect(scored[0].likelihood! * scored[0].impact!).toBeLessThanOrEqual(
      scored.at(-1)!.likelihood! * scored.at(-1)!.impact!,
    );
  });

  it('applies UC-2-02 rules to new risks', () => {
    const body = {
      name: 'Отказ ранера',
      description: 'Падает сборка',
      hazard: 'Отказ инфраструктуры',
      category: 'Операционные',
      process: 'Релизы и деплой',
      asset: '',
      top: false,
    };
    expect(validateNewRisk(body, user('U-005'), DICTIONARIES)).toBeNull();
    expect(validateNewRisk({ ...body, process: 'Казначейство' }, user('U-005'), DICTIONARIES)).toBe(
      'Можно выбрать только процесс своей дирекции',
    );
    expect(
      validateNewRisk({ ...body, process: 'Казначейство' }, user('U-001'), DICTIONARIES),
    ).toBeNull();
    expect(validateNewRisk(body, user('U-003'), DICTIONARIES)).toBe(
      'Недостаточно прав для создания риска',
    );
    expect(validateNewRisk({ ...body, name: ' ' }, user('U-005'), DICTIONARIES)).toBe(
      'Заполните обязательные поля',
    );

    const risk = createRisk(RISKS, body, DICTIONARIES, '2026-10-22');
    expect(risk).toMatchObject({
      id: 'R-0154',
      status: 'DRAFT',
      likelihood: null,
      owner: 'Ким Р. А.',
    });
  });
});
