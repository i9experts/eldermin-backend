import { BadRequestException } from '@nestjs/common';
import { buildSafeguardingCreateData } from './safeguarding-create.util';
import { ComplianceController } from './compliance.controller';

const UID = 'a'.repeat(24);
const SID = 'b'.repeat(24);
// The exact request the Teacher app sends (kSafeguardingRequestKeys).
const appBody = {
  title: 'Concern', description: 'Details', type: 'bullying', severity: 'medium',
  reportedDate: '2026-10-12', actionsTaken: 'Spoke to student', studentId: SID, studentName: 'A B', studentGrade: '5',
};
const teacher = { userId: UID, name: 'Ms Teacher', role: 'teacher', campusId: 'c'.repeat(24) };

function msg(fn: () => any): string {
  try { fn(); } catch (e: any) { return JSON.stringify(e.getResponse?.() ?? e.message); }
  return '';
}

describe('POST /compliance/safeguarding body (reporter vs lead)', () => {
  it('teacher: the app request is accepted; identity comes from the token', () => {
    const d = buildSafeguardingCreateData({ ...appBody }, teacher, 'school', 'x', false);
    expect(d).toMatchObject({ ...appBody, schoolSlug: 'school', reportedBy: 'Ms Teacher', reportedById: UID });
  });

  it('teacher: minimal body (required fields only) is accepted', () => {
    const d = buildSafeguardingCreateData({ title: 't', description: 'd', type: 'other' }, teacher, 's', 'x', false);
    expect(d.title).toBe('t');
    expect(d.severity).toBeUndefined();
  });

  it.each(['status', 'assignedTo', 'assignedToId', 'confidential', 'caseNumber', 'policeInvolved', 'reportedBy', 'reportedById', 'campusId', 'schoolSlug', 'resolutionNotes', 'parentNotified'])(
    'teacher: %s in the body -> 400', (key) => {
      expect(() => buildSafeguardingCreateData({ ...appBody, [key]: 'x' }, teacher, 's', 'x', false)).toThrow(BadRequestException);
      expect(msg(() => buildSafeguardingCreateData({ ...appBody, [key]: 'x' }, teacher, 's', 'x', false))).toContain(key);
    });

  it.each([
    [{}], [{ title: 't' }], [{ ...appBody, type: 'nope' }], [{ ...appBody, severity: 'huge' }],
    [{ ...appBody, reportedDate: 'not a date' }], [{ ...appBody, studentId: 'xyz' }], [{ ...appBody, description: '' }],
    [null], [[]], ['str'],
  ])('malformed body %j -> 400 (was 500)', (body: any) => {
    for (const manage of [false, true]) {
      expect(() => buildSafeguardingCreateData(body, teacher, 's', 'x', manage)).toThrow(BadRequestException);
    }
  });

  it('lead (safeguarding:write): lead-owned fields still accepted (web unchanged)', () => {
    const web = { ...appBody, status: 'under_investigation', assignedTo: 'DSL', confidential: true, policeInvolved: true,
      parentNotified: true, socialServicesInvolved: false, externalReferral: 'Yes', externalAgency: 'X', reportedBy: 'Web User' };
    const d = buildSafeguardingCreateData(web, { userId: UID, name: 'Admin' }, 'school', 'x', true);
    expect(d).toMatchObject({ ...web, schoolSlug: 'school', reportedBy: 'Web User', reportedById: UID });
  });

  it('lead: reportedBy falls back to the token name and schoolSlug cannot be overridden', () => {
    const d = buildSafeguardingCreateData({ ...appBody, schoolSlug: 'evil' }, { userId: UID, name: 'Admin' }, 'school', 'x', true);
    expect(d.reportedBy).toBe('Admin');
    expect(d.schoolSlug).toBe('school');
  });
});

describe('ComplianceController.createSafeguarding', () => {
  const make = () => {
    const service: any = { createSafeguardingCase: jest.fn(async (d: any) => d) };
    return { service, ctl: new ComplianceController(service, {} as any, {} as any) };
  };
  const req = (role: string) => ({ user: { userId: UID, name: 'N', role, schoolSlug: 'school' }, headers: {} });

  it('teacher with extra lead fields -> 400, nothing saved', async () => {
    const { service, ctl } = make();
    await expect(ctl.createSafeguarding({ ...appBody, status: 'closed', confidential: true }, req('teacher'))).rejects.toThrow(BadRequestException);
    expect(service.createSafeguardingCase).not.toHaveBeenCalled();
  });

  it('teacher with the app body -> saved with token identity', async () => {
    const { service, ctl } = make();
    await ctl.createSafeguarding({ ...appBody }, req('teacher'));
    expect(service.createSafeguardingCase.mock.calls[0][0]).toMatchObject({ reportedBy: 'N', reportedById: UID, schoolSlug: 'school' });
  });

  it.each(['admin', 'principal', 'institution_owner', 'hr_manager', 'support_staff'])('%s keeps lead fields (unchanged)', async (role) => {
    const { service, ctl } = make();
    await ctl.createSafeguarding({ ...appBody, status: 'escalated', confidential: true, assignedTo: 'DSL' }, req(role));
    expect(service.createSafeguardingCase.mock.calls[0][0]).toMatchObject({ status: 'escalated', confidential: true, assignedTo: 'DSL' });
  });
});
