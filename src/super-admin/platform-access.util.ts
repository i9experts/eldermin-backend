// Platform-level mirror of src/roles/module-access.util.ts - pure,
// framework-free resolution logic for the Team & Access permission system.
// Field names (tabKey/subTabKey) differ from the institution-level
// moduleKey/subModuleKey, so this is a small dedicated copy rather than a
// forced reuse of the other one's exact shape.

export type PlatformAccessLevel = 'none' | 'view' | 'manage';

export interface PlatformModuleAccessEntry {
  tabKey: string;
  level: 'view' | 'manage';
  subTabKey?: string | null;
}

export function resolvePlatformAccessLevel(
  moduleAccess: PlatformModuleAccessEntry[] | null | undefined,
  tabKey: string,
  subTabKey?: string | null,
): PlatformAccessLevel {
  if (!moduleAccess || moduleAccess.length === 0) return 'none';

  if (subTabKey) {
    const specific = moduleAccess.find(m => m.tabKey === tabKey && m.subTabKey === subTabKey);
    if (specific) return specific.level;
  }

  const tabWide = moduleAccess.find(m => m.tabKey === tabKey && !m.subTabKey);
  if (tabWide) return tabWide.level;

  return 'none';
}

export function satisfiesRequiredPlatformLevel(
  granted: PlatformAccessLevel,
  required: 'view' | 'manage',
): boolean {
  if (granted === 'none') return false;
  if (required === 'view') return granted === 'view' || granted === 'manage';
  return granted === 'manage';
}
