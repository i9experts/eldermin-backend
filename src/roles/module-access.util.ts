// Pure, framework-free resolution logic for the custom-role permission
// system (see role.schema.ts / CustomRoleGuard) - kept dependency-free so
// the actual "what level does this user have for this route" decision is
// directly unit-testable without mocking Mongoose.

export type ModuleAccessLevel = 'none' | 'view' | 'manage';

export interface ModuleAccessEntry {
  moduleKey: string;
  level: 'view' | 'manage';
  subModuleKey?: string | null;
}

/**
 * Resolves the effective access level a role's moduleAccess array grants
 * for a given module + (optional) sub-module.
 *
 * Resolution order:
 *  1. An entry that matches BOTH moduleKey and subModuleKey exactly wins -
 *     this is the granular, sub-module-specific grant.
 *  2. Otherwise, an entry for the same moduleKey with no subModuleKey (i.e.
 *     a module-wide grant, including every entry ever saved before
 *     sub-modules existed) applies to every sub-module under it.
 *  3. If neither exists, the module is not granted at all -> 'none'.
 *
 * A sub-module-specific entry never "leaks" into other sub-modules, and a
 * module-wide entry always covers every sub-module - so old data (which
 * only ever has module-wide entries) keeps meaning exactly what it always
 * meant.
 */
export function resolveAccessLevel(
  moduleAccess: ModuleAccessEntry[] | null | undefined,
  moduleKey: string,
  subModuleKey?: string | null,
): ModuleAccessLevel {
  if (!moduleAccess || moduleAccess.length === 0) return 'none';

  if (subModuleKey) {
    const specific = moduleAccess.find(
      m => m.moduleKey === moduleKey && m.subModuleKey === subModuleKey,
    );
    if (specific) return specific.level;
  }

  const moduleWide = moduleAccess.find(
    m => m.moduleKey === moduleKey && !m.subModuleKey,
  );
  if (moduleWide) return moduleWide.level;

  return 'none';
}

/** Whether a granted level satisfies a required level. 'manage' implies
 * 'view' (matching the existing standard-role matrix's convention); 'view'
 * never satisfies a 'manage' requirement; 'none' satisfies nothing. */
export function satisfiesRequiredLevel(
  granted: ModuleAccessLevel,
  required: 'view' | 'manage',
): boolean {
  if (granted === 'none') return false;
  if (required === 'view') return granted === 'view' || granted === 'manage';
  return granted === 'manage';
}

/**
 * Used by RolesOrModuleManageGuard: does a custom role's moduleAccess grant
 * `level` on `moduleKey` in a way that counts for a role-list-or-custom-role
 * route?
 *
 *  - allowModuleWide=false (admin-set routes): only an entry WITH a
 *    subModuleKey (granular grant) counts. A module-wide entry is ignored,
 *    because the stock seeded "Teacher" role carries module-wide
 *    teaching:manage and must not unlock admin actions.
 *  - allowModuleWide=true (staff-write routes): a module-wide entry OR any
 *    sub-module entry of that module counts.
 */
export function customRoleGrants(
  moduleAccess: ModuleAccessEntry[] | null | undefined,
  moduleKey: string,
  level: 'view' | 'manage',
  allowModuleWide: boolean,
): boolean {
  if (!Array.isArray(moduleAccess)) return false;
  return moduleAccess.some(
    m =>
      m &&
      m.moduleKey === moduleKey &&
      (allowModuleWide || !!m.subModuleKey) &&
      satisfiesRequiredLevel(m.level, level),
  );
}
