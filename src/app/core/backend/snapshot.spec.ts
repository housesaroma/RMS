import { Raw, backendId, build, fromDetails, uiRights } from './snapshot';

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
  treatments: [],
  approvals: [],
  likelihood: [],
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
            riskProcessIds: [40],
          },
        ],
        treatments: [
          {
            treatmentId: 5,
            riskId: 12,
            riskProcessId: 40,
            treatmentTitle: 'Резервный канал',
            treatmentDescription: null,
            treatmentStatus: 'PendingApproval',
            dueDate: '2026-12-01T00:00:00+00:00',
            treatmentCostPlan: 60000,
            treatmentCostAct: 0,
            createdById: 8,
            assigneeId: null,
            createdAt: '2026-10-27T10:00:00+00:00',
            updatedAt: null,
            approvalRequestId: 3,
            approvalRequiredLevel: 'Director',
            approvalRequestStatus: 'Pending',
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
    expect(s.state.risks[0].measures[0]).toMatchObject({
      id: 'М-0005',
      status: 'APPROVAL',
      process: 'B2B',
      dueDate: '2026-12-01',
      costActual: null,
      requests: [{ level: 'DIRECTOR', status: 'APPROVAL' }],
    });
    expect(backendId('R-0012')).toBe(12);
  });

  it('takes the passport, links and assessment versions from the risk card', () => {
    const version = (active: boolean, score: number) => ({
      likelihoodWeight: 4,
      impactWeight: 4,
      lossAmount: 600000,
      downtimeTotalHours: null,
      hourlyDowntimeCost: null,
      riskScore: score,
      responseMode: active ? 'treat' : null,
      isActive: active,
      createdByName: 'Иванова Анна Сергеевна',
      createdAt: '2026-10-27T10:00:00+00:00',
    });
    const d = fromDetails(
      {
        riskDescription: 'Отказ CRM',
        closeReason: null,
        authorName: 'Петров Пётр',
        authorPosition: 'Аналитик',
        processes: [
          { processTitle: 'Старый', directorate: 'ИТ', ownerName: 'X', isPrimary: false, isActive: false },
          { processTitle: 'B2B', directorate: 'Продажи', ownerName: 'Y', isPrimary: true, isActive: true },
          { processTitle: 'B2C', directorate: 'Продажи', ownerName: 'Z', isPrimary: false, isActive: true },
        ],
        assessments: [version(true, 16), version(false, 6)],
      },
      'ACTIVE',
    );
    expect(d).toMatchObject({
      description: 'Отказ CRM',
      process: 'B2B',
      responseMode: 'treat',
      assessment: { score: 16, lossAmount: 600000 },
      previous: { score: 6 },
    });
    expect(d.secondary?.map((x) => x.name)).toEqual(['B2C']);
  });
});
