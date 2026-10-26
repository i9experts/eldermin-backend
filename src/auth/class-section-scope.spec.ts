import { ForbiddenException } from '@nestjs/common';
import { resolveClassSectionScope } from './scope.util';

// Pins the fix for the bug where a teacher assigned as class teacher of a
// SECOND section (common in Early Years) could never actually access that
// section's attendance - resolveClassSectionScope used to know only the
// first (singular) assignment, so a request for the second section 403'd
// even though the teacher really held it.

describe('resolveClassSectionScope', () => {
  it('passes requested grade/section through unrestricted when the user has no class-teacher assignment at all', () => {
    const result = resolveClassSectionScope({}, 'Grade 5', 'A');
    expect(result).toEqual({ grade: 'Grade 5', section: 'A' });
  });

  it('allows a request for the SECOND section of a multi-section class teacher', () => {
    const user = {
      classTeacherAssignments: [
        { gradeId: 'g1', gradeName: 'Pre K-2', sectionId: 's1', sectionName: 'Pre K-2A', name: 'Pre K-2A' },
        { gradeId: 'g2', gradeName: 'KG', sectionId: 's2', sectionName: 'KG A', name: 'KG A' },
      ],
    };
    const result = resolveClassSectionScope(user, 'KG', 'KG A');
    expect(result).toEqual({ grade: 'KG', section: 'KG A' });
  });

  it('403s a request for a class the teacher does not hold, even with multiple assignments', () => {
    const user = {
      classTeacherAssignments: [
        { gradeId: 'g1', gradeName: 'Pre K-2', sectionId: 's1', sectionName: 'Pre K-2A', name: 'Pre K-2A' },
      ],
    };
    expect(() => resolveClassSectionScope(user, 'Grade 5', 'B')).toThrow(ForbiddenException);
  });

  it('with no requested grade, defaults to the first assignment (back-compat with the single-assignment behaviour)', () => {
    const user = {
      classTeacherAssignments: [
        { gradeId: 'g1', gradeName: 'Pre K-2', sectionId: 's1', sectionName: 'Pre K-2A', name: 'Pre K-2A' },
        { gradeId: 'g2', gradeName: 'KG', sectionId: 's2', sectionName: 'KG A', name: 'KG A' },
      ],
    };
    const result = resolveClassSectionScope(user);
    expect(result).toEqual({ grade: 'Pre K-2', section: 'Pre K-2A' });
  });

  it('falls back to the legacy singular fields for a token issued before classTeacherAssignments existed', () => {
    const user = { classTeacherOfGradeName: 'Grade 3', classTeacherOfSectionName: 'B' };
    expect(resolveClassSectionScope(user, 'Grade 3', 'B')).toEqual({ grade: 'Grade 3', section: 'B' });
    expect(() => resolveClassSectionScope(user, 'Grade 4', 'A')).toThrow(ForbiddenException);
  });
});
