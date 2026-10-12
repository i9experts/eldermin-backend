// CRM Leads Pipeline (Super Admin) - live-smoke + CRUD round-trip.
// Run: npx jest test/e2e/leads.crm.e2e-spec.ts --config ./test/jest-e2e.json --runInBand
//
// Needs a super_admin account - set via env, since the demo-school account
// in helpers.ts (DEMO) is a regular institution_owner and every endpoint
// below except POST / is @Roles(SUPER_ADMIN)-gated:
//   SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npx jest test/e2e/leads.crm.e2e-spec.ts --config ./test/jest-e2e.json --runInBand
// Without those vars set, the super_admin-gated tests are skipped (not failed)
// rather than giving a false red on an environment that just has no such
// account configured yet.
import request from 'supertest';
import { API, DEMO, login } from './helpers';

jest.setTimeout(30_000);

const HAS_SUPER_ADMIN = !!process.env.SUPER_ADMIN_EMAIL && !!process.env.SUPER_ADMIN_PASSWORD;
const describeSuperAdmin = HAS_SUPER_ADMIN ? describe : describe.skip;

const uniqueEmail = () => `qa-lead-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

describe('POST /leads (public intake)', () => {
  it('is reachable with no auth at all (marketing-site facing)', async () => {
    const res = await request(API).post('/leads').send({
      source: 'contact_form',
      schoolName: 'QA Test School',
      adminName: 'QA Tester',
      adminEmail: uniqueEmail(),
    });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe('new');
    expect(res.body.schoolName).toBe('QA Test School');
  });

  it('rejects an invalid source value', async () => {
    const res = await request(API).post('/leads').send({
      source: 'google_ads', // not in the enum - onboarding_wizard | contact_form | manual
      schoolName: 'QA Test School',
      adminName: 'QA Tester',
      adminEmail: uniqueEmail(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a missing required field (schoolName)', async () => {
    const res = await request(API).post('/leads').send({
      source: 'manual',
      adminName: 'QA Tester',
      adminEmail: uniqueEmail(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const res = await request(API).post('/leads').send({
      source: 'manual',
      schoolName: 'QA Test School',
      adminName: 'QA Tester',
      adminEmail: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  // Previously a KNOWN GAP (see QA report): resubmitting the same
  // adminEmail used to create a second, separate Lead document instead of
  // being folded into the existing one. Fixed in LeadsService.create() -
  // a resubmission for an email with an open (not converted/lost) lead now
  // updates that same lead and appends a note, rather than duplicating it.
  it('folds a resubmission for the same adminEmail into the existing open lead, not a duplicate', async () => {
    const email = uniqueEmail();
    const first = await request(API).post('/leads').send({
      source: 'manual', schoolName: 'Dup School', adminName: 'Dup Tester', adminEmail: email,
    });
    const second = await request(API).post('/leads').send({
      source: 'contact_form', schoolName: 'Dup School (updated)', adminName: 'Dup Tester', adminEmail: email,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body._id).toBe(first.body._id);
    expect(second.body.schoolName).toBe('Dup School (updated)');
    const notes = second.body.notes ?? [];
    expect(notes.some((n: any) => /submitted the contact form again/i.test(n.text))).toBe(true);
  });

});

describe('tenancy/auth: GET /leads (super-admin only, no tenant scope by design)', () => {
  it('rejects requests with no token', async () => {
    await request(API).get('/leads').expect(401);
  });

  it('rejects a regular (non-super-admin) institution account', async () => {
    const token = await login(DEMO.email, DEMO.password);
    const res = await request(API).get('/leads').set('Authorization', `Bearer ${token}`);
    expect([401, 403]).toContain(res.status);
  });
});

describeSuperAdmin('CRUD + pipeline: /leads (as super_admin)', () => {
  let token: string;
  let createdId: string;
  const email = uniqueEmail();

  beforeAll(async () => {
    token = await login(process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_PASSWORD);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('creates a lead via the public endpoint, then super_admin can list it', async () => {
    const create = await request(API).post('/leads').send({
      source: 'onboarding_wizard',
      schoolName: 'QA Pipeline School',
      adminName: 'QA Pipeline Tester',
      adminEmail: email,
    });
    expect(create.status).toBe(201);
    createdId = create.body._id;

    const list = await auth(request(API).get('/leads')).expect(200);
    expect(list.body.some((l: any) => l._id === createdId)).toBe(true);
  });

  it('GET /leads/stats returns a count per pipeline stage', async () => {
    const res = await auth(request(API).get('/leads/stats')).expect(200);
    for (const stage of ['new', 'contacted', 'demo_scheduled', 'trial', 'converted', 'lost']) {
      expect(typeof res.body[stage]).toBe('number');
    }
  });

  it('GET /leads?stage=new includes the created lead (filter works)', async () => {
    const res = await auth(request(API).get('/leads').query({ stage: 'new' })).expect(200);
    expect(res.body.every((l: any) => l.stage === 'new')).toBe(true);
    expect(res.body.some((l: any) => l._id === createdId)).toBe(true);
  });

  it('GET /leads/:id returns the lead detail', async () => {
    const res = await auth(request(API).get(`/leads/${createdId}`)).expect(200);
    expect(res.body.adminEmail).toBe(email.toLowerCase());
  });

  it('PATCH /leads/:id moves it through the pipeline (Contacted stamps lastContactedAt)', async () => {
    const res = await auth(request(API).patch(`/leads/${createdId}`))
      .send({ stage: 'contacted' })
      .expect(200);
    expect(res.body.stage).toBe('contacted');
    expect(res.body.lastContactedAt).toBeTruthy();
  });

  it('POST /leads/:id/notes appends a note with author attribution', async () => {
    const res = await auth(request(API).post(`/leads/${createdId}/notes`))
      .send({ text: 'QA note: called, left voicemail' })
      .expect(201);
    const notes = res.body.notes ?? [];
    expect(notes.some((n: any) => n.text === 'QA note: called, left voicemail')).toBe(true);
  });

  // Documents the real finding from the investigation: flipping stage to
  // 'converted' via the generic PATCH is a label-only change - it must NOT
  // set convertedInstitutionId or create any Tenant/Institution/User. Real
  // conversion only happens through POST /super-admin/institutions/
  // activate-from-lead/:leadId (separate suite below).
  it('PATCH stage=converted does NOT create a real institution (label-only)', async () => {
    const res = await auth(request(API).patch(`/leads/${createdId}`))
      .send({ stage: 'converted' })
      .expect(200);
    expect(res.body.stage).toBe('converted');
    expect(res.body.convertedInstitutionId ?? null).toBeNull();
  });

  // The dedup fold-in (see "POST /leads (public intake)" above) only applies
  // to an open lead - a lead already in a closed stage (converted here,
  // from the test just above) is left alone, and a resubmission for that
  // same email creates a genuinely new lead instead of reopening old history.
  it('does NOT fold a resubmission into a lead that is already converted', async () => {
    const resubmit = await request(API).post('/leads').send({
      source: 'manual', schoolName: 'QA Pipeline School (new inquiry)', adminName: 'QA Pipeline Tester', adminEmail: email,
    });
    expect(resubmit.status).toBe(201);
    expect(resubmit.body._id).not.toBe(createdId);
  });
});

describeSuperAdmin('Real conversion: POST /super-admin/institutions/activate-from-lead/:leadId', () => {
  let token: string;
  let leadId: string;
  const email = uniqueEmail();

  beforeAll(async () => {
    token = await login(process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_PASSWORD);
    const create = await request(API).post('/leads').send({
      source: 'manual',
      schoolName: 'QA Activation School',
      adminName: 'QA Activation Tester',
      adminEmail: email,
    });
    leadId = create.body._id;
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('activating creates a real tenant/institution/admin and links convertedInstitutionId back on the lead', async () => {
    const res = await auth(request(API).post(`/super-admin/institutions/activate-from-lead/${leadId}`)).expect(201);
    expect(res.body.adminEmail).toBe(email.toLowerCase());
    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.slug).toBeTruthy();

    const lead = await auth(request(API).get(`/leads/${leadId}`)).expect(200);
    expect(lead.body.stage).toBe('converted');
    expect(lead.body.convertedInstitutionId).toBeTruthy();
  });

  it('activating an already-activated lead is rejected, not silently repeated', async () => {
    const res = await auth(request(API).post(`/super-admin/institutions/activate-from-lead/${leadId}`));
    expect(res.status).toBe(400);
  });
});

// The self-service wizard (POST /onboarding/register, then PATCH .../step
// per step, then POST .../complete) previously created a real Tenant/
// Institution/User with zero visibility into the CRM Leads Pipeline at all
// - Super Admin had no way to even see self-service signups, let alone
// which of the 8 wizard steps a prospect reached before abandoning. This
// suite is the companion coverage for that wiring in onboarding.service.ts.
describeSuperAdmin('Onboarding wizard -> CRM lead visibility', () => {
  let adminToken: string;
  const email = uniqueEmail();
  const schoolName = `QA Wizard School ${Date.now()}`;
  let wizardToken: string;
  let leadId: string;

  beforeAll(async () => {
    adminToken = await login(process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_PASSWORD);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  it('registering creates a lead immediately, already linked to the real (trial) institution', async () => {
    const register = await request(API).post('/onboarding/register').send({
      firstName: 'QA', lastName: 'Wizard', email, password: 'QaWizard@1234', schoolName,
      utmSource: 'google', utmCampaign: 'qa-e2e',
    }).expect(201);
    wizardToken = register.body.token;
    expect(wizardToken).toBeTruthy();

    const list = await auth(request(API).get('/leads').query({ stage: 'trial' })).expect(200);
    const lead = list.body.find((l: any) => l.adminEmail === email.toLowerCase());
    expect(lead).toBeTruthy();
    leadId = lead._id;
    expect(lead.source).toBe('onboarding_wizard');
    expect(lead.convertedInstitutionId).toBeTruthy(); // already real - "Activate Institution" should show "already activated"
    expect(lead.utmSource).toBe('google');
    expect(lead.utmCampaign).toBe('qa-e2e');
  });

  it('completing step 1 enriches the lead with country/city/school type', async () => {
    await request(API).patch('/onboarding/step')
      .set('Authorization', `Bearer ${wizardToken}`)
      .send({ step: 1, data: { institutionType: 'K-12', country: 'Pakistan', city: 'Karachi' } })
      .expect(200);

    const lead = await auth(request(API).get(`/leads/${leadId}`)).expect(200);
    expect(lead.body.schoolType).toBe('K-12');
    expect(lead.body.country).toBe('Pakistan');
    expect(lead.body.city).toBe('Karachi');
  });

  it('completing step 5 enriches the lead with requested modules/plan', async () => {
    await request(API).patch('/onboarding/step')
      .set('Authorization', `Bearer ${wizardToken}`)
      .send({ step: 5, data: { selectedBundle: 'Academic Excellence Suite', selectedModules: ['Teaching Management', 'Curriculum Intelligence'] } })
      .expect(200);

    const lead = await auth(request(API).get(`/leads/${leadId}`)).expect(200);
    expect(lead.body.planRequested).toBe('Academic Excellence Suite');
    expect(lead.body.modulesRequested).toEqual(['Teaching Management', 'Curriculum Intelligence']);
  });

  it('finishing the wizard moves the lead to Converted', async () => {
    await request(API).post('/onboarding/complete')
      .set('Authorization', `Bearer ${wizardToken}`)
      .expect(201);

    const lead = await auth(request(API).get(`/leads/${leadId}`)).expect(200);
    expect(lead.body.stage).toBe('converted');
  });

  // Same dedup principle as LeadsService.create(), applied on the
  // register() path too (it creates leads directly, not through
  // LeadsService): a sales inquiry logged before someone self-signs up with
  // the same email should become the same lead, not a second one.
  it('registering with an email that already has an open manual lead reuses it instead of duplicating', async () => {
    const dedupEmail = uniqueEmail();
    const manual = await request(API).post('/leads').send({
      source: 'manual', schoolName: 'Pre-existing Inquiry School', adminName: 'Pre Existing', adminEmail: dedupEmail,
    }).expect(201);

    await request(API).post('/onboarding/register').send({
      firstName: 'Dedup', lastName: 'Test', email: dedupEmail, password: 'QaWizard@1234', schoolName: 'Self-Signup School',
    }).expect(201);

    const lead = await auth(request(API).get(`/leads/${manual.body._id}`)).expect(200);
    expect(lead.body.stage).toBe('trial');
    expect(lead.body.source).toBe('onboarding_wizard');
    expect(lead.body.convertedInstitutionId).toBeTruthy();

    const all = await auth(request(API).get('/leads')).expect(200);
    expect(all.body.filter((l: any) => l.adminEmail === dedupEmail.toLowerCase())).toHaveLength(1);
  });
});
