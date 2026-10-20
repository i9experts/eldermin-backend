/**
 * Builds the display label shown as "Class Teacher Of" on a teacher's
 * profile. Schools that type a section's full name (e.g. "Grade 2B",
 * "KG-B") into the "Section Name" field instead of just a bare letter
 * (e.g. "B") used to get a redundant label like "Grade-2 - Grade 2B",
 * because the grade name and the section name were always concatenated
 * regardless of whether the section name already included it.
 *
 * This normalizes both strings (lowercase, alphanumeric-only) and, when
 * the section name already starts with the grade name, uses the section
 * name alone instead of concatenating.
 */
export function buildClassTeacherOfName(gradeName: string, sectionName?: string | null): string {
  if (!sectionName) return gradeName;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedGrade = normalize(gradeName);
  const normalizedSection = normalize(sectionName);
  if (normalizedGrade && normalizedSection.startsWith(normalizedGrade)) {
    return sectionName;
  }
  return `${gradeName} - ${sectionName}`;
}
