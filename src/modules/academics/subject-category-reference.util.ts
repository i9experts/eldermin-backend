// Pure, framework-free helper for AcademicsService's subject-category-delete
// guard, mirroring subject-reference.util.ts's describeSubjectBlockers /
// buildSubjectInUseMessage split. A SubjectCategory is catalog data referenced
// by Subject.category as a plain string code, so the only thing that can
// block a delete is "how many subjects still use this code" - kept as a
// standalone pure function so the message/pluralization logic is directly
// unit-testable without mocking Mongoose models.

/**
 * Builds the "cannot delete" message for a subject category still in use by
 * one or more subjects - empty/zero count means it's safe to delete.
 * Mirrors buildSubjectInUseMessage's "name what's using it" convention.
 */
export function buildSubjectCategoryInUseMessage(subjectCount: number): string {
  return `Cannot delete this category - it is still used by ${subjectCount} subject${subjectCount === 1 ? '' : 's'}. Reassign those subjects to a different category first, or deactivate the category instead.`;
}
