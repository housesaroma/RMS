import { Raw, backendId, build, uiRights } from './snapshot';

const b64 = (o: object) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const token = (id: number, role: string) =>
  `x.${b64({
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': String(id),
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'o@x.ru',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': role,
  })}.sig`;

const raw = (over: Partial<Raw> = {}): Raw => ({
  users: [],
  roles: [],
  rights: [],
  roleRights: {},
  directorates: [{ directorateId: 1, directorateTitle: 'Продажи', isDirectorateActive: true }],
  processes: [
    {
      processId: 3,
      directorateId: 1,
      processTitle: 'B2B',
      ownerId: 3,
      isProcessActive: true,
    },
  ],
  persons: [
    { personId: 3, userId: 8, directorateId: 1, personPosition: null, isPersonActive: true },
  ],
  assets: [],
  categories: [],
  hazards: [],
  hazardGroups: [],
  impact: [],
  acceptance: null,
  approval: null,
  risks: [],
  failed: {},
  ...over,
});

describe('backend snapshot', () => {
  it('maps coarse backend rights to the UI rights of the role', () => {
    expect(uiRights('OWNER', ['accept_risk', 'create_components'])).toEqual([
      'accept_owner_risk',
      'create_risk',
      'create_treatment',
    ]);
    expect(uiRights('ADMIN', ['view_risk'])).toEqual(['admin']);
  });

  it('builds the profile from the token and risks from the list rows', () => {
    const s = build(
      raw({
        risks: [
          {
            riskId: 12,
            riskTitle: 'Отказ CRM',
            processes: ['B2B'],
            directorates: ['Продажи'],
            owners: ['Тестов В. Ф.'],
            asset: null,
            hazard: 'Отказ оборудования',
            category: 'Операционные',
            likelihood: '3',
            impact: 'Высокая',
            riskScore: 12,
            riskStatus: 'Open',
            acceptanceLevel: 'DIRECTOR',
          },
        ],
      }),
      token(8, 'OWNER'),
    );
    expect(s.me).toMatchObject({ id: 'U-008', email: 'o@x.ru', roles: ['OWNER'] });
    expect(s.me.rights).toContain('assess_risk');
    expect(s.state.dict.processes[0]).toMatchObject({ name: 'B2B', ownerId: 'U-008' });
    expect(s.state.risks[0]).toMatchObject({
      id: 'R-0012',
      status: 'ACTIVE',
      likelihood: 3,
      impact: 4,
    });
    expect(backendId('R-0012')).toBe(12);
  });
});
