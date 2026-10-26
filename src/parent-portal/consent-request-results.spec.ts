import { NotFoundException } from '@nestjs/common';
import { ParentPortalService } from './parent-portal.service';

// getConsentRequestResults drives the admin-facing "Results" view for a
// Parent Consent request (and its PDF export) - who granted, who declined,
// who hasn't responded, by whom and when, per student, plus a class-wise
// rollup. Covers the two things most likely to regress: pending students
// (no response doc at all) must still show up with decision 'pending', and
// the class-wise counts must match the per-student rows exactly.

function makeService(overrides: {
  consentRequestModel?: any; studentModel?: any; consentResponseModel?: any;
}) {
  const n: any = {};
  const args = new Array(31).fill(n);
  args[0] = overrides.studentModel ?? n;
  args[18] = overrides.consentRequestModel ?? n;
  args[19] = overrides.consentResponseModel ?? n;
  const ParentPortalServiceAny: any = ParentPortalService;
  return new ParentPortalServiceAny(...args) as ParentPortalService;
}

describe('ParentPortalService.getConsentRequestResults', () => {
  const requestId = 'req1';
  const schoolSlug = 'demo-school';
  const studentIds = ['s1', 's2', 's3'];

  const consentRequestModel = {
    findOne: () => ({
      lean: () => Promise.resolve({
        _id: requestId, schoolSlug, title: 'Museum trip', description: 'Please confirm',
        category: 'field_trip', dueDate: new Date('2026-11-01'), studentIds, attachments: [],
        createdAt: new Date('2026-10-01'), isActive: true,
      }),
    }),
  };

  const studentModel = {
    find: () => ({
      select: () => ({
        lean: () => Promise.resolve([
          { _id: 's1', firstName: 'Ayesha', lastName: 'Khan', currentGrade: 'Grade-1', currentSection: 'A', currentRollNumber: '1' },
          { _id: 's2', firstName: 'Bilal', lastName: 'Raza', currentGrade: 'Grade-1', currentSection: 'A', currentRollNumber: '2' },
          { _id: 's3', firstName: 'Sana', lastName: 'Iqbal', currentGrade: 'Grade-1', currentSection: 'B', currentRollNumber: '3' },
        ]),
      }),
    }),
  };

  const consentResponseModel = {
    find: () => ({
      lean: () => Promise.resolve([
        { studentId: 's1', decision: 'granted', respondedByName: 'Mr. Khan', createdAt: new Date('2026-10-02T10:00:00Z') },
        { studentId: 's2', decision: 'declined', respondedByName: 'Mrs. Raza', notes: 'Clashes with another trip', createdAt: new Date('2026-10-03T08:30:00Z') },
      ]),
    }),
  };

  it('marks a student with no response as pending and rolls up class-wise counts', async () => {
    const svc = makeService({ consentRequestModel, studentModel, consentResponseModel });
    const result: any = await svc.getConsentRequestResults(schoolSlug, requestId);

    expect(result.students).toHaveLength(3);
    const byId = Object.fromEntries(result.students.map((s: any) => [s.studentId, s]));
    expect(byId.s1.decision).toBe('granted');
    expect(byId.s1.respondedByName).toBe('Mr. Khan');
    expect(byId.s2.decision).toBe('declined');
    expect(byId.s2.notes).toBe('Clashes with another trip');
    expect(byId.s3.decision).toBe('pending');
    expect(byId.s3.respondedAt).toBeNull();

    const sectionA = result.classSummary.find((c: any) => c.grade === 'Grade-1' && c.section === 'A');
    const sectionB = result.classSummary.find((c: any) => c.grade === 'Grade-1' && c.section === 'B');
    expect(sectionA).toEqual({ grade: 'Grade-1', section: 'A', granted: 1, declined: 1, pending: 0, total: 2 });
    expect(sectionB).toEqual({ grade: 'Grade-1', section: 'B', granted: 0, declined: 0, pending: 1, total: 1 });
  });

  it('throws NotFoundException for a request in a different school or that does not exist', async () => {
    const svc = makeService({ consentRequestModel: { findOne: () => ({ lean: () => Promise.resolve(null) }) }, studentModel, consentResponseModel });
    await expect(svc.getConsentRequestResults(schoolSlug, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
