import { resolveAccessLevel, satisfiesRequiredLevel, ModuleAccessEntry } from './module-access.util';

describe('resolveAccessLevel', () => {
  it('returns none for an empty/missing moduleAccess array', () => {
    expect(resolveAccessLevel([], 'finance', 'ledger')).toBe('none');
    expect(resolveAccessLevel(null, 'finance', 'ledger')).toBe('none');
    expect(resolveAccessLevel(undefined, 'finance', 'ledger')).toBe('none');
  });

  it('returns none when the module is not present at all', () => {
    const access: ModuleAccessEntry[] = [{ moduleKey: 'hr', level: 'manage' }];
    expect(resolveAccessLevel(access, 'finance', 'ledger')).toBe('none');
  });

  it('a module-wide entry (no subModuleKey) applies to every sub-module - this is the legacy shape, pre-dating sub-modules', () => {
    const access: ModuleAccessEntry[] = [{ moduleKey: 'finance', level: 'view' }];
    expect(resolveAccessLevel(access, 'finance', 'ledger')).toBe('view');
    expect(resolveAccessLevel(access, 'finance', 'payable')).toBe('view');
    expect(resolveAccessLevel(access, 'finance', undefined)).toBe('view');
  });

  it('a sub-module-specific entry wins over a module-wide one for that sub-module', () => {
    const access: ModuleAccessEntry[] = [
      { moduleKey: 'finance', level: 'view' },
      { moduleKey: 'finance', level: 'manage', subModuleKey: 'payable' },
    ];
    expect(resolveAccessLevel(access, 'finance', 'payable')).toBe('manage');
    // Everything else still falls back to the module-wide grant
    expect(resolveAccessLevel(access, 'finance', 'ledger')).toBe('view');
  });

  it('a sub-module-specific entry does NOT leak into other sub-modules when there is no module-wide fallback', () => {
    const access: ModuleAccessEntry[] = [
      { moduleKey: 'finance', level: 'manage', subModuleKey: 'payable' },
    ];
    expect(resolveAccessLevel(access, 'finance', 'payable')).toBe('manage');
    expect(resolveAccessLevel(access, 'finance', 'ledger')).toBe('none');
  });

  it('looking up without a subModuleKey only consults the module-wide entry, even if sub-module entries exist', () => {
    const access: ModuleAccessEntry[] = [
      { moduleKey: 'finance', level: 'manage', subModuleKey: 'payable' },
    ];
    expect(resolveAccessLevel(access, 'finance', undefined)).toBe('none');
  });

  it('entries for a different moduleKey never match, even with the same subModuleKey string', () => {
    const access: ModuleAccessEntry[] = [
      { moduleKey: 'hr', level: 'manage', subModuleKey: 'reports' },
    ];
    expect(resolveAccessLevel(access, 'finance', 'reports')).toBe('none');
  });
});

describe('satisfiesRequiredLevel', () => {
  it('none satisfies nothing', () => {
    expect(satisfiesRequiredLevel('none', 'view')).toBe(false);
    expect(satisfiesRequiredLevel('none', 'manage')).toBe(false);
  });

  it('view satisfies a view requirement but not a manage requirement', () => {
    expect(satisfiesRequiredLevel('view', 'view')).toBe(true);
    expect(satisfiesRequiredLevel('view', 'manage')).toBe(false);
  });

  it('manage satisfies both view and manage requirements (manage implies view)', () => {
    expect(satisfiesRequiredLevel('manage', 'view')).toBe(true);
    expect(satisfiesRequiredLevel('manage', 'manage')).toBe(true);
  });
});
