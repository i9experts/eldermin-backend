import { auditClassMatching } from './class-match-audit.util';

describe('auditClassMatching', () => {
  const students = [
    { id: '1', grade: '5', section: ' a ' },
    { id: '2', grade: 'Grade 7', section: 'B' },
    { id: '3', grade: 'Nursery', section: 'A' },
    { id: '4', grade: '15', section: 'A' },
  ];
  const assignments = [
    { teacherId: 't1', grade: 'Grade 5', section: 'A', source: 'classTeacher' as const },
    { teacherId: 't2', grade: 'Grade 7', section: null, source: 'assignment' as const },
    { teacherId: 't3', grade: 'Grade 9', section: 'A', source: 'assignment' as const },
    { teacherId: 't4', grade: '', section: 'A', source: 'assignment' as const },
  ];

  it('finds unmatched students and assignments using tolerant matching', () => {
    const r = auditClassMatching(students, assignments);
    expect(r.unmatchedStudents.map((s) => s.id)).toEqual(['3', '4']);
    expect(r.unmatchedAssignments.map((a) => a.teacherId)).toEqual(['t3']);
    expect(r.totals).toEqual({ students: 4, assignments: 3 });
  });

  it('records raw strings from both sides', () => {
    const r = auditClassMatching(students, assignments);
    expect(r.studentRaw.grades['"5"']).toBe(1);
    expect(r.studentRaw.sections['" a "']).toBe(1);
    expect(r.assignmentRaw.grades['(empty)']).toBe(1);
    expect(r.assignmentRaw.sections['(empty)']).toBe(1);
  });

  it('section-less assignment covers every section of the grade', () => {
    const r = auditClassMatching([{ id: 'x', grade: '7', section: 'Z' }], [{ teacherId: 't', grade: 'Grade 7', source: 'assignment' }]);
    expect(r.unmatchedStudents).toHaveLength(0);
  });
});
