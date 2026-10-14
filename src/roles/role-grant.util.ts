// Pure helpers for "no granting above your own level" and key validation on
// custom roles. Dependency-free so the escalation rules are unit-testable
// without Mongoose.
import { ASSIGNABLE_MODULES, SUB_MODULES } from './schemas/role.schema';
import { ModuleAccessEntry, resolveAccessLevel, satisfiesRequiredLevel } from './module-access.util';

export type Ceiling = 'unrestricted' | ModuleAccessEntry[];

/** Entries of `requested` that the grantor's `ceiling` does not cover. */
export function entriesAboveCeiling(ceiling: Ceiling, requested: ModuleAccessEntry[] | undefined | null): ModuleAccessEntry[] {
  if (ceiling === 'unrestricted') return [];
  return (requested || []).filter(e => {
    const granted = resolveAccessLevel(ceiling, e.moduleKey, e.subModuleKey || null);
    return !satisfiesRequiredLevel(granted, e.level);
  });
}

/** Entries naming a module / sub-module that does not exist. */
export function entriesWithUnknownKeys(requested: ModuleAccessEntry[] | undefined | null): ModuleAccessEntry[] {
  const modules = new Set<string>(ASSIGNABLE_MODULES.map(m => m.key));
  return (requested || []).filter(e => {
    if (!modules.has(e.moduleKey)) return true;
    if (e.subModuleKey && !(SUB_MODULES[e.moduleKey] || []).some(s => s.key === e.subModuleKey)) return true;
    return false;
  });
}

export function describeEntry(e: ModuleAccessEntry): string {
  return `${e.moduleKey}${e.subModuleKey ? ':' + e.subModuleKey : ''}:${e.level}`;
}
