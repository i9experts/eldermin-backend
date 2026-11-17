import { SuperAdminService } from './super-admin.service';

// activateInstitutionFromLead previously ALWAYS granted every module in
// the lead's requested plan tier (e.g. Enterprise = all 16), ignoring
// which modules the lead actually checked. The Super Admin now reviews
// and confirms an explicit module list in CRMTab's activation modal
// before every activation - these tests cover the override path added
// for that, the untouched legacy path for any other caller, and the
// unknown-id guard rail.
function sa() {
  const svc: any = Object.create(SuperAdminService.prototype);
  // MODULE_NAME_TO_ID is a `private readonly` class field initializer, so
  // it only exists on a real constructed instance, never on the prototype
  // Object.create reaches - reproduce it here rather than constructing a
  // full SuperAdminService (which needs ~15 injected models).
  svc.MODULE_NAME_TO_ID = {
    'Organization': 'organization',
    'Compliance & Governance': 'compliance',
    'Documents & Workflow': 'documents',
    'Human Resource': 'hr',
    'Teacher Module': 'teaching',
    'Financial Module': 'finance',
    'Procurement & Purchase': 'procurement',
    'Campus Operations': 'campus-ops',
    'Admission Life Cycle': 'admissions',
    'Curriculum Intelligence': 'curriculum',
    'Syllabus Coverage': 'syllabus',
    'Timetable Intelligence': 'timetable',
    'Library Management': 'library',
    'Student Profile': 'students',
    'Assessment': 'assessment',
    'Behaviour & Tarbiyah': 'behaviour',
    'Data Intelligence': 'analytics',
  };
  // Each test overrides svc.leadModel.findById with the exact chain shape
  // (await findById(...) vs. .select(...).lean()) its code path needs.
  svc.leadModel = { findById: jest.fn() };
  svc.userModel = { findOne: jest.fn(async () => null), create: jest.fn(async (doc: any) => doc) };
  svc.tenantModel = { findOne: jest.fn(async () => null), create: jest.fn(async (doc: any) => doc) };
  svc.orgInstitutionModel = { create: jest.fn(async (doc: any) => ({ ...doc, _id: 'org1' })) };
  svc.schoolModel = { findOneAndUpdate: jest.fn(async () => ({})) };
  svc.campusModel = { create: jest.fn(async () => ({ _id: 'campus1' })) };
  svc.gradeModel = { bulkWrite: jest.fn(async () => ({})) };
  svc.academicYearModel = { create: jest.fn(async () => ({})) };
  svc.institutionModel = function (this: any, doc: any) {
    Object.assign(this, doc);
    this.save = async () => this;
  } as any;
  svc.subHistoryModel = function (this: any) { this.save = async () => ({}); } as any;
  return svc;
}

function mockLead(overrides: any = {}) {
  return {
    _id: 'lead1',
    schoolName: 'Allied School',
    adminEmail: 'admin@allied.edu',
    adminName: 'Adnan Imtiaz',
    adminPhone: '0300',
    city: 'Uch Shareef',
    country: 'Pakistan',
    schoolType: 'Secondary/O-Level',
    planRequested: 'Enterprise',
    modulesRequested: ['Compliance & Governance', 'Human Resource'],
    convertedInstitutionId: null,
    save: jest.fn(async () => ({})),
    ...overrides,
  };
}

describe('activateInstitutionFromLead module resolution', () => {
  it('without an override, preserves the legacy plan-wins behaviour (regression guard)', async () => {
    const svc = sa();
    svc.leadModel.findById = jest.fn(async () => mockLead());
    const result = await svc.activateInstitutionFromLead('lead1', 'admin');
    expect(result.message).toBe('Institution activated');
    const tenantCreateArg = svc.tenantModel.create.mock.calls[0][0];
    // Enterprise plan = every module in the registry, same as before this fix.
    expect(tenantCreateArg.activeModules).toEqual(
      expect.arrayContaining(['organization', 'compliance', 'hr', 'finance', 'analytics']),
    );
    expect(tenantCreateArg.activeModules.length).toBeGreaterThan(10);
  });

  it('with an explicit moduleIds override, uses EXACTLY that set (plus the core module)', async () => {
    const svc = sa();
    svc.leadModel.findById = jest.fn(async () => mockLead());
    await svc.activateInstitutionFromLead('lead1', 'admin', ['compliance', 'hr']);
    const tenantCreateArg = svc.tenantModel.create.mock.calls[0][0];
    expect(tenantCreateArg.activeModules.sort()).toEqual(['compliance', 'hr', 'organization'].sort());
  });

  it('rejects an override containing an unknown module id', async () => {
    const svc = sa();
    svc.leadModel.findById = jest.fn(async () => mockLead());
    await expect(
      svc.activateInstitutionFromLead('lead1', 'admin', ['compliance', 'not-a-real-module']),
    ).rejects.toThrow(/Unknown module id/);
    expect(svc.tenantModel.create).not.toHaveBeenCalled();
  });

  it('an empty override array still grants the mandatory core module only', async () => {
    const svc = sa();
    svc.leadModel.findById = jest.fn(async () => mockLead());
    await svc.activateInstitutionFromLead('lead1', 'admin', []);
    const tenantCreateArg = svc.tenantModel.create.mock.calls[0][0];
    expect(tenantCreateArg.activeModules).toEqual(['organization']);
  });
});

describe("mapRequestedModulesToIds resolves a lead's actual requested-module labels", () => {
  it('resolves the exact labels the marketing wizard sends, matching the Allied School lead', () => {
    const svc = sa();
    const ids = svc.mapRequestedModulesToIds(['Compliance & Governance', 'Human Resource']);
    expect(ids.sort()).toEqual(['compliance', 'hr'].sort());
  });

  it('drops unrecognized labels rather than throwing', () => {
    const svc = sa();
    const ids = svc.mapRequestedModulesToIds(['Compliance & Governance', 'Some Future Module']);
    expect(ids).toEqual(['compliance']);
  });

  it('resolves every label in the known vocabulary to a real registry id', () => {
    const svc = sa();
    // The marketing wizard's full module-selection vocabulary - every one
    // of these must resolve, or a lead who requested it silently loses it.
    const labels = [
      'Organization', 'Compliance & Governance', 'Documents & Workflow', 'Human Resource',
      'Teacher Module', 'Financial Module', 'Procurement & Purchase', 'Campus Operations',
      'Admission Life Cycle', 'Curriculum Intelligence', 'Syllabus Coverage',
      'Timetable Intelligence', 'Library Management', 'Student Profile', 'Assessment',
      'Behaviour & Tarbiyah', 'Data Intelligence',
    ];
    const ids = svc.mapRequestedModulesToIds(labels);
    expect(ids).toHaveLength(labels.length);
  });
});

describe('getModuleRegistry / getRequestedModuleIds for the activation review modal', () => {
  it('getModuleRegistry returns the full static registry', () => {
    const svc = sa();
    const registry = svc.getModuleRegistry();
    expect(registry.length).toBeGreaterThan(10);
    expect(registry.find((m: any) => m.id === 'compliance')?.name).toBe('Governance & Compliance');
  });

  it("getRequestedModuleIds resolves a lead's modulesRequested from the DB", async () => {
    const svc = sa();
    svc.leadModel.findById = jest.fn(() => ({
      select: () => ({ lean: async () => ({ modulesRequested: ['Compliance & Governance', 'Human Resource'] }) }),
    }));
    const ids = await svc.getRequestedModuleIds('lead1');
    expect(ids.sort()).toEqual(['compliance', 'hr'].sort());
  });

  it('getRequestedModuleIds throws for a missing lead', async () => {
    const svc = sa();
    svc.leadModel.findById = jest.fn(() => ({ select: () => ({ lean: async () => null }) }));
    await expect(svc.getRequestedModuleIds('missing')).rejects.toThrow('Lead not found');
  });
});
