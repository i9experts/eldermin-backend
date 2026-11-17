import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadCaptureLinkService } from './lead-capture-link.service';

// A query-like mock: awaiting it directly resolves `doc` (a document with
// its own .save()), same as Mongoose's thenable queries; `.lean()` instead
// resolves a plain object with no methods, matching how the real driver
// behaves.
function queryResult(doc: any, leanDoc: any = doc) {
  return {
    lean: () => Promise.resolve(leanDoc),
    select: () => queryResult(doc, leanDoc),
    then: (resolve: any, reject: any) => Promise.resolve(doc).then(resolve, reject),
    catch: (reject: any) => Promise.resolve(doc).catch(reject),
  };
}

function makeSavable(data: any) {
  return { ...data, save: jest.fn(async function (this: any) { return this; }) };
}

function build(opts: {
  existingLink?: any;
  school?: any;
  currentYear?: any;
} = {}) {
  const link = opts.existingLink !== undefined ? opts.existingLink : null;

  const linkModel: any = jest.fn().mockImplementation((data: any) => makeSavable(data));
  linkModel.findOne = jest.fn(() => queryResult(link ? makeSavable(link) : null, link));
  linkModel.find = jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(link ? [link] : []) }) }));

  const leadModel: any = jest.fn().mockImplementation((data: any) => makeSavable(data));

  const school = 'school' in opts ? opts.school : { name: 'Allied School', logo: '' };
  const schoolModel: any = { findOne: jest.fn(() => queryResult(school, school)) };

  const currentYear = 'currentYear' in opts ? opts.currentYear : { name: '2026-27' };
  const yearModel: any = { findOne: jest.fn(() => queryResult(currentYear, currentYear)) };

  const svc = new LeadCaptureLinkService(linkModel, leadModel, schoolModel, yearModel);
  return { svc, linkModel, leadModel, schoolModel, yearModel };
}

describe('LeadCaptureLinkService', () => {
  it('generates a link scoped to the school with a random token', async () => {
    const { svc, linkModel } = build();
    const result: any = await svc.createLink('allied-school', undefined, 'user1');
    expect(result.schoolSlug).toBe('allied-school');
    expect(result.token).toMatch(/^[a-f0-9]{48}$/);
    expect(linkModel).toHaveBeenCalledWith(
      expect.objectContaining({ schoolSlug: 'allied-school', createdBy: 'user1' }),
    );
  });

  it('getPublicFormInfo: valid active token for an active school returns form info', async () => {
    const { svc } = build({
      existingLink: { token: 'tok1', schoolSlug: 'allied-school', isActive: true, campusId: null },
      school: { name: 'Allied School', logo: 'logo.png' },
    });
    const info = await svc.getPublicFormInfo('tok1');
    expect(info).toEqual({ schoolName: 'Allied School', schoolLogo: 'logo.png', hasCampusChoice: true });
  });

  it('getPublicFormInfo: unknown/deactivated token -> 404', async () => {
    const { svc } = build({ existingLink: null });
    await expect(svc.getPublicFormInfo('bad-token')).rejects.toThrow(NotFoundException);
  });

  it('getPublicFormInfo: token valid but school no longer active -> 404', async () => {
    const { svc } = build({
      existingLink: { token: 'tok1', schoolSlug: 'allied-school', isActive: true, campusId: null },
      school: null,
    });
    await expect(svc.getPublicFormInfo('tok1')).rejects.toThrow(NotFoundException);
  });

  it('submitPublicForm: valid submission creates a Lead with source website/status new and resolves current academic year', async () => {
    const { svc, leadModel, linkModel } = build({
      existingLink: { token: 'tok1', schoolSlug: 'allied-school', isActive: true, submissionCount: 2 },
      currentYear: { name: '2026-27' },
    });
    const dto = { firstName: 'Ali', lastName: 'Khan', phone: '0300', gradeInterested: 'Grade 5' };
    const result = await svc.submitPublicForm('tok1', dto as any, '1.2.3.4');

    expect(result).toEqual({ success: true });
    expect(leadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Ali', lastName: 'Khan', source: 'website', status: 'new',
        schoolSlug: 'allied-school', academicYear: '2026-27',
      }),
    );
  });

  it('submitPublicForm: invalid/deactivated token -> 404, no Lead created', async () => {
    const { svc, leadModel } = build({ existingLink: null });
    await expect(
      svc.submitPublicForm('bad', { firstName: 'A', lastName: 'B', phone: '1', gradeInterested: 'G1' } as any, '1.1.1.1'),
    ).rejects.toThrow(NotFoundException);
    expect(leadModel).not.toHaveBeenCalled();
  });

  it('submitPublicForm: honeypot filled -> fake success, no Lead created', async () => {
    const { svc, leadModel } = build({
      existingLink: { token: 'tok1', schoolSlug: 'allied-school', isActive: true },
    });
    const dto = { firstName: 'Bot', lastName: 'X', phone: '0', gradeInterested: 'G1', website: 'http://spam.example' };
    const result = await svc.submitPublicForm('tok1', dto as any, '9.9.9.9');
    expect(result).toEqual({ success: true });
    expect(leadModel).not.toHaveBeenCalled();
  });

  it('submitPublicForm: rate limit kicks in after repeated submissions from the same token+IP', async () => {
    const { svc } = build({
      existingLink: { token: 'tok-rl', schoolSlug: 'allied-school', isActive: true },
    });
    const dto = { firstName: 'A', lastName: 'B', phone: '1', gradeInterested: 'G1' };
    for (let i = 0; i < 5; i++) {
      await svc.submitPublicForm('tok-rl', dto as any, '5.5.5.5');
    }
    await expect(svc.submitPublicForm('tok-rl', dto as any, '5.5.5.5')).rejects.toThrow(BadRequestException);
  });

  it('updateLink: regenerates the token, invalidating the old one', async () => {
    const existing = makeSavable({ _id: 'l1', schoolSlug: 'allied-school', token: 'old-token', isActive: true });
    const linkModel: any = jest.fn();
    linkModel.findOne = jest.fn(() => queryResult(existing));
    const svc = new LeadCaptureLinkService(linkModel, {} as any, {} as any, {} as any);

    const result: any = await svc.updateLink('l1', 'allied-school', { regenerateToken: true });
    expect(result.token).not.toBe('old-token');
    expect(result.token).toMatch(/^[a-f0-9]{48}$/);
  });

  it('updateLink: unknown id/schoolSlug -> 404', async () => {
    const linkModel: any = { findOne: jest.fn(() => queryResult(null)) };
    const svc = new LeadCaptureLinkService(linkModel, {} as any, {} as any, {} as any);
    await expect(svc.updateLink('x', 'y', { isActive: false })).rejects.toThrow(NotFoundException);
  });
});
