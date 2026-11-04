import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

// Pins the fix for "the Setup Wizard link/button never goes away": Tenant.
// isSetupComplete defaults to false and is only ever flipped true by the
// self-service wizard's own completion step - a school Super Admin
// activates directly (CRM "Activate Institution") never goes through that
// wizard, so the flag used to sit stuck at false forever for every one of
// those live, fully-active schools. login() now also treats "no
// OnboardingSession document exists for this school" as complete, since
// only the self-service signup flow (OnboardingService.register) ever
// creates one - its absence reliably means this school was never meant to
// see the wizard in the first place, regardless of the stored flag.

const GOOD = bcrypt.hashSync('Correct#1', 4);

function build(opts: { tenant: any; hasOnboardingSession: boolean }) {
  const svc: any = Object.create(AuthService.prototype);
  const user = {
    _id: 'u1', email: 'a@x.test', isActive: true, passwordHash: GOOD,
    primaryRole: 'institution_owner', schoolSlug: 'demo-school', tokenVersion: 0,
  };
  svc.userModel = {
    findOne: () => ({ lean: () => Promise.resolve(user) }),
    findByIdAndUpdate: jest.fn(),
  };
  svc.tenantModel = { findOne: () => ({ lean: () => Promise.resolve(opts.tenant) }) };
  svc.usageLogModel = { findOneAndUpdate: jest.fn(() => Promise.resolve({})) };
  svc.onboardingSessionModel = { exists: jest.fn(async () => (opts.hasOnboardingSession ? { _id: 's1' } : null)) };
  svc.rolesService = { getPermissionsForUser: () => Promise.resolve(null) };
  svc.resolveScopeFieldsForUser = () => Promise.resolve({});
  svc.jwtService = { sign: jest.fn(() => 'signed.jwt.token') };
  return svc;
}

describe('AuthService.login - Setup Wizard gating (institution.isSetupComplete)', () => {
  it('is false for a self-service signup still mid-wizard (isSetupComplete:false, has a session)', async () => {
    const svc = build({
      tenant: { _id: 't1', slug: 'demo-school', isSetupComplete: false, status: 'onboarding' },
      hasOnboardingSession: true,
    });
    const result = await svc.login('a@x.test', 'Correct#1');
    expect(result.institution.isSetupComplete).toBe(false);
  });

  it('is true once the self-service wizard records completion', async () => {
    const svc = build({
      tenant: { _id: 't1', slug: 'demo-school', isSetupComplete: true, status: 'active' },
      hasOnboardingSession: true,
    });
    const result = await svc.login('a@x.test', 'Correct#1');
    expect(result.institution.isSetupComplete).toBe(true);
  });

  it('is true for a Super-Admin-activated school even though isSetupComplete is stuck false (no OnboardingSession exists)', async () => {
    const svc = build({
      tenant: { _id: 't1', slug: 'demo-school', isSetupComplete: false, status: 'active' },
      hasOnboardingSession: false,
    });
    const result = await svc.login('a@x.test', 'Correct#1');
    expect(result.institution.isSetupComplete).toBe(true);
  });

  it('is true when there is no tenant record at all (never blocks login on a missing/legacy tenant)', async () => {
    const svc = build({ tenant: null, hasOnboardingSession: false });
    const result = await svc.login('a@x.test', 'Correct#1');
    expect(result.institution.isSetupComplete).toBe(true);
  });
});
