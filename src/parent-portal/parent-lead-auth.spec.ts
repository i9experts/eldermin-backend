import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ParentAuthService } from './parent-auth.service';

function build(opts: { leads?: any[]; institutions?: any[]; geocodeThrows?: boolean } = {}) {
  const leads = (opts.leads ?? []).map(l => ({ ...l }));
  const institutions = opts.institutions ?? [];
  const saved: any[] = [];

  const parentLeadModel: any = {
    findOne: jest.fn((f: any) => {
      const found = leads.find(l => l.email === f.email);
      return {
        lean: () => Promise.resolve(found ? { ...found } : null),
        then: (res: any) => Promise.resolve(found ? docOf(found) : null).then(res), // allow `await findOne()` without .lean()
      };
    }),
    create: jest.fn(async (doc: any) => {
      const created = { _id: 'lead-' + leads.length, ...doc };
      leads.push(created);
      return docOf(created);
    }),
  };

  // Wraps a plain lead object so `.save()` works like a real Mongoose doc.
  function docOf(obj: any) {
    return { ...obj, save: async () => { saved.push(obj); return obj; } };
  }

  const institutionModel: any = {
    findOne: jest.fn((f: any) => ({
      select: () => ({
        lean: () => {
          const re = f.name;
          const match = institutions.find(i => re.test(i.name));
          return Promise.resolve(match || null);
        },
      }),
    })),
  };

  const geocodingService: any = {
    reverseGeocode: jest.fn(async () => {
      if (opts.geocodeThrows) throw new Error('nominatim down');
      return { country: 'Pakistan', city: 'Karachi', district: 'Karachi South' };
    }),
  };

  const jwtService: any = { sign: jest.fn(() => 'signed.jwt.token') };
  const otpModel: any = {};
  const userModel: any = {};
  const studentModel: any = {};
  const tenantModel: any = {};
  const whatsAppService: any = {};

  const svc = new ParentAuthService(
    otpModel, userModel, studentModel, tenantModel,
    institutionModel, parentLeadModel,
    jwtService, whatsAppService, geocodingService,
  );
  return { svc, leads, saved };
}

describe('ParentAuthService.registerLead', () => {
  it('creates a lead, hashes the password, and signs a parent_lead token', async () => {
    const { svc, leads } = build();
    const result = await svc.registerLead({
      fullName: 'Aisha Khan', email: 'Aisha@Example.com', password: 'Passw0rd!',
      schoolName: 'Unlisted Montessori', lat: 24.86, lng: 67.0,
    } as any);

    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe('aisha@example.com'); // lowercased
    expect(await bcrypt.compare('Passw0rd!', leads[0].passwordHash)).toBe(true);
    expect(leads[0].matchedInstitutionId).toBeNull();
    expect(leads[0].location).toEqual({ lat: 24.86, lng: 67.0, country: 'Pakistan', city: 'Karachi', district: 'Karachi South' });
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user.isSchoolOnboarded).toBe(false);
  });

  it('links to a real Institution on an exact, case-insensitive name match', async () => {
    const { svc, leads } = build({ institutions: [{ _id: 'inst-1', name: 'Greenwood Academy' }] });
    await svc.registerLead({
      fullName: 'Bilal', email: 'bilal@example.com', password: 'Passw0rd!',
      schoolName: '  greenwood academy  ',
    } as any);
    expect(String(leads[0].matchedInstitutionId)).toBe('inst-1');
  });

  it('rejects a duplicate email', async () => {
    const { svc } = build({ leads: [{ email: 'dup@example.com', passwordHash: 'x' }] });
    await expect(svc.registerLead({
      fullName: 'X', email: 'dup@example.com', password: 'Passw0rd!', schoolName: 'Any School',
    } as any)).rejects.toThrow(ConflictException);
  });

  it('still succeeds with empty location when geocoding returns nothing (Nominatim down/rate-limited)', async () => {
    // GeocodingService itself always catches network/HTTP errors and
    // resolves to {} (see geocoding.service.ts) - it never throws out to
    // the caller. This proves registerLead treats that empty result as
    // "no location available" rather than failing the signup.
    const geocodingService: any = { reverseGeocode: jest.fn(async () => ({})) };
    const { svc, leads } = build();
    (svc as any).geocodingService = geocodingService;

    const result = await svc.registerLead({
      fullName: 'Z', email: 'z@example.com', password: 'Passw0rd!', schoolName: 'Any School',
      lat: 1, lng: 1,
    } as any);

    expect(leads).toHaveLength(1);
    expect(leads[0].location).toEqual({ lat: 1, lng: 1, country: undefined, city: undefined, district: undefined });
    expect(result.accessToken).toBe('signed.jwt.token');
  });
});

describe('ParentAuthService.loginLead', () => {
  it('logs in with the correct password', async () => {
    const hash = await bcrypt.hash('Correct#1', 4);
    const { svc } = build({ leads: [{ _id: 'lead-1', email: 'a@example.com', passwordHash: hash }] });
    const result = await svc.loginLead({ email: 'A@Example.com', password: 'Correct#1' } as any);
    expect(result.accessToken).toBe('signed.jwt.token');
  });

  it('rejects an unknown email with the same generic message as a wrong password', async () => {
    const { svc } = build();
    await expect(svc.loginLead({ email: 'nobody@example.com', password: 'x' } as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong password', async () => {
    const hash = await bcrypt.hash('Correct#1', 4);
    const { svc } = build({ leads: [{ _id: 'lead-1', email: 'a@example.com', passwordHash: hash }] });
    await expect(svc.loginLead({ email: 'a@example.com', password: 'wrong' } as any)).rejects.toThrow(UnauthorizedException);
  });
});
