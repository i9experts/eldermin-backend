import { OrganizationService } from './organization.service';

// Unit tests for the Apple App Store downloads field added to
// getParentAppActivation() - confirms it surfaces the AppStoreConnectService
// result as-is and that the user-facing "notes.downloads" text correctly
// reflects whether Apple is configured, without touching the existing
// login-based activation numbers at all.

function lean(result: any) {
  return { select: () => ({ lean: () => Promise.resolve(result) }) };
}

function makeService(appleResult: any) {
  const campusModel: any = { find: jest.fn().mockReturnValue(lean([{ _id: 'c1', name: 'Main Campus' }])) };
  const studentModel: any = {
    find: jest.fn().mockReturnValue(lean([{ _id: 's1', campusId: 'c1', guardians: [{ phone: '+920000000000' }] }])),
  };
  const userModel: any = { find: jest.fn().mockReturnValue(lean([])) };
  const staffModel: any = { aggregate: jest.fn().mockResolvedValue([]) };
  const appStoreConnectService: any = { getRecentDownloads: jest.fn().mockResolvedValue(appleResult) };
  const noop: any = {};

  const service = new OrganizationService(
    noop, campusModel, noop, noop, noop, noop, noop, studentModel, noop, noop, noop, staffModel, noop, userModel,
    noop, noop, appStoreConnectService,
  );
  return service;
}

describe('OrganizationService.getParentAppActivation - Apple App Store downloads', () => {
  it('surfaces a "not configured" Apple result as-is, without touching login-based activation numbers', async () => {
    const appleResult = { configured: false, count: null, windowDays: null, asOf: null };
    const service = makeService(appleResult);
    const report = await service.getParentAppActivation('demo-school', 'tenant-1');

    expect(report.appleAppStoreDownloads).toEqual(appleResult);
    expect(report.notes.downloads).toMatch(/Google Play\/App Store Developer APIs/);
    expect(report.overall).toHaveProperty('activationRate');
    expect(report.overall).toHaveProperty('activatedParents');
  });

  it('surfaces a configured Apple result and updates the notes text to say Apple is connected', async () => {
    const appleResult = { configured: true, count: 123, windowDays: 30, asOf: '2026-10-23T00:00:00.000Z' };
    const service = makeService(appleResult);
    const report = await service.getParentAppActivation('demo-school', 'tenant-1');

    expect(report.appleAppStoreDownloads).toEqual(appleResult);
    expect(report.notes.downloads).toMatch(/Apple App Store downloads are now connected/);
    expect(report.notes.downloads).toMatch(/Google Play download counts still aren.t connected/);
  });
});
