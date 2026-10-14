import { ModuleAccessEntry } from './module-access.util';

/**
 * True only when the custom role holds the WHOLE module at `manage`: an entry
 * for `moduleKey` with no subModuleKey and level 'manage'. Sub-module-only
 * grants (e.g. institution:audit:manage) do not count. Used for routes that
 * mirror a web gate expressed as the module-wide permission `<module>:manage`
 * (Roles page, Campuses supervisors).
 */
export function hasFullModuleManage(moduleAccess: ModuleAccessEntry[] | null | undefined, moduleKey: string): boolean {
  if (!Array.isArray(moduleAccess)) return false;
  return moduleAccess.some(m => m && m.moduleKey === moduleKey && !m.subModuleKey && m.level === 'manage');
}
