import { TeachingService } from './teaching.service';

// Pins TeachingService.getHomeworkSummary, built for the Institution Overview
// dashboard's "Homework Summary" widget. It cross-references each class's
// timetable periods for the given day against Assignment records to decide,
// per (grade, section, subject): unassigned, assigned-but-draft, or
// published - per the product decision that status 'assigned' or later
// counts as published (no separate publish flag exists in the data model).

function makeService(timetableModel: any, assignmentModel: any) {
  const svc: any = Object.create(TeachingService.prototype);
  svc.timetableModel = timetableModel;
  svc.assignmentModel = assignmentModel;
  return svc;
}

describe('TeachingService.getHomeworkSummary', () => {
  // 2026-11-04 is a Wednesday -> Date#getDay() === 3.
  const WEDNESDAY = '2026-11-04';

  it('buckets each taught subject into unassigned/draft/published per class', async () => {
    const timetableModel: any = {
      find: () => ({
        select: () => ({
          lean: async () => [
            {
              gradeLevel: 'Grade 5', sectionName: 'A',
              periods: [
                { day: 3, subject: 'Math', teacherName: 'Ms. Ali', type: 'lecture' },
                { day: 3, subject: 'English', teacherName: 'Mr. Khan', type: 'lecture' },
                { day: 3, subject: 'Break', type: 'break' }, // non-teaching, excluded
                { day: 4, subject: 'Science', teacherName: 'Ms. Rao', type: 'lecture' }, // different day, excluded
              ],
            },
          ],
        }),
      }),
    };
    const assignmentModel: any = {
      find: () => ({
        select: () => ({
          lean: async () => [
            { gradeLevel: 'Grade 5', sectionName: 'A', subject: 'Math', status: 'assigned' },
            { gradeLevel: 'Grade 5', sectionName: 'A', subject: 'English', status: 'draft' },
          ],
        }),
      }),
    };
    const svc = makeService(timetableModel, assignmentModel);

    const result = await svc.getHomeworkSummary('demo-school', WEDNESDAY);

    expect(result.date).toBe(WEDNESDAY);
    expect(result.totalClasses).toBe(1);
    expect(result.classesAssignedHomework).toBe(1);
    expect(result.totals).toEqual({ total: 2, assigned: 2, published: 1, unassigned: 0, unpublished: 1 });
    expect(result.classes[0].subjects).toEqual([
      { subject: 'Math', teacherName: 'Ms. Ali', assigned: true, published: true },
      { subject: 'English', teacherName: 'Mr. Khan', assigned: true, published: false },
    ]);
  });

  it('counts a class with no Assignment record for any of its subjects as fully unassigned', async () => {
    const timetableModel: any = {
      find: () => ({
        select: () => ({
          lean: async () => [
            {
              gradeLevel: 'Grade 1', sectionName: 'B',
              periods: [{ day: 3, subject: 'Urdu', teacherName: 'Ms. Fatima', type: 'lecture' }],
            },
          ],
        }),
      }),
    };
    const assignmentModel: any = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
    const svc = makeService(timetableModel, assignmentModel);

    const result = await svc.getHomeworkSummary('demo-school', WEDNESDAY);

    expect(result.classesAssignedHomework).toBe(0);
    expect(result.totals).toEqual({ total: 1, assigned: 0, published: 0, unassigned: 1, unpublished: 1 });
  });

  it('returns no classes when nothing is timetabled for the day', async () => {
    const timetableModel: any = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
    const assignmentModel: any = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
    const svc = makeService(timetableModel, assignmentModel);

    const result = await svc.getHomeworkSummary('demo-school', WEDNESDAY);

    expect(result.totalClasses).toBe(0);
    expect(result.classes).toEqual([]);
  });
});
