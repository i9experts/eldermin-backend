// Route -> (module, sub-module) rules for the generic custom-role guard (R1). Pure data + pure functions, no Nest, no DB.
//
// The keys MIRROR THE WEB (Eldermin-Frontend src/types/roles.ts hasSubModulePermission, src/App.tsx route guards, the per-page tab ids):
//  - a route is reachable when canAccess('<module>:view', <tab id>) holds; a module-wide grant covers every sub-module, a sub-module
//    grant covers that sub-module only (the sub-specific entry wins, exactly resolveAccessLevel), and a rule with no `sub` accepts ANY
//    entry of the module (the web routes call canAccess(permission) with no sub-key, so any granular grant opens the page);
//  - the web has almost no manage checks; the BACKEND adds them: a write (non-GET/HEAD) needs the 'manage' level, a read needs 'view'
//    ('manage' implies 'view'). This is what makes a view-only custom role read-only and a module-less custom role locked out.
// A rule lists ALTERNATIVES because the web reaches the same API from two places (e.g. /syllabus from the Academics page AND the
// Teaching tab; /students list from the Students page AND as the roster of the Teaching attendance tab).
// Base-role staff WITHOUT a custom role are never evaluated (the guard is a no-op for them).

export interface Alt { module: string; sub?: string }
export interface PolicyRule {
  name: string;
  re: RegExp;
  read: Alt[];
  write: Alt[];
  /** non-GET calls that are read receipts rather than data changes (circular acknowledge): need only 'view'. */
  writeNeedsView?: boolean;
}

const A = (module: string, sub?: string): Alt => ({ module, sub });

// order matters: first match wins
export const POLICY_RULES: PolicyRule[] = [
  // legacy behaviour lists living under /students (BehaviourStaffOnlyGuard); web: Students page / Behaviour module
  { name: 'students-behaviour', re: /^\/students\/(behaviour|[^/]+\/behaviour)(\/|$)/, read: [A('behaviour')], write: [A('behaviour')] },
  // marking attendance is the Teaching page "attendance" tab (teaching:view + sub attendance); the Students page "attendance" tab is the report/correction
  { name: 'student-attendance', re: /^\/students\/(attendance|[^/]+\/attendance)(\/|$)/, read: [A('teaching', 'attendance'), A('students')], write: [A('teaching', 'attendance'), A('students')] },
  // Students list/360/etc: students page, and the roster of the Teaching tabs (attendance, homework)
  { name: 'students', re: /^\/students(\/|$)/, read: [A('students'), A('teaching')], write: [A('students')] },
  // Assessments page has no tab gating on the web; the Teaching "assessments" tab reads the same API
  { name: 'assessments', re: /^\/assessments(\/|$)/, read: [A('assessments'), A('teaching', 'assessments')], write: [A('assessments')] },
  // /syllabus: Academics page tab 'syllabus' AND Teaching tab 'syllabus'
  { name: 'syllabus', re: /^\/syllabus(\/|$)/, read: [A('academics', 'syllabus'), A('teaching', 'syllabus')], write: [A('academics', 'syllabus'), A('teaching', 'syllabus')] },
  // Behaviour page tabs: dashboard, records, tarbiyah, qaida, nazra, counselling, interventions, reports
  { name: 'behaviour-qaida', re: /^\/behaviour\/qaida(\/|$)/, read: [A('behaviour', 'qaida')], write: [A('behaviour', 'qaida')] },
  { name: 'behaviour-nazra', re: /^\/behaviour\/nazra(\/|$)/, read: [A('behaviour', 'nazra')], write: [A('behaviour', 'nazra')] },
  { name: 'behaviour-records', re: /^\/behaviour\/(records|students\/[^/]+\/profile)(\/|$)/, read: [A('behaviour', 'records')], write: [A('behaviour', 'records')] },
  { name: 'behaviour-tarbiyah', re: /^\/behaviour\/tarbiyah(-traits)?(\/|$)/, read: [A('behaviour', 'tarbiyah')], write: [A('behaviour', 'tarbiyah')] },
  { name: 'behaviour-dashboard', re: /^\/behaviour\/dashboard(\/|$)/, read: [A('behaviour', 'dashboard')], write: [A('behaviour', 'dashboard')] },
  { name: 'behaviour-counselling', re: /^\/behaviour\/counselling(\/|$)/, read: [A('behaviour', 'counselling')], write: [A('behaviour', 'counselling')] },
  { name: 'behaviour-interventions', re: /^\/behaviour\/interventions(\/|$)/, read: [A('behaviour', 'interventions')], write: [A('behaviour', 'interventions')] },
  { name: 'behaviour-reports', re: /^\/behaviour\/reports(\/|$)/, read: [A('behaviour', 'reports')], write: [A('behaviour', 'reports')] },
  { name: 'behaviour', re: /^\/behaviour(\/|$)/, read: [A('behaviour')], write: [A('behaviour')] },
  // Academics page tabs
  { name: 'curriculum', re: /^\/academics\/curriculum(\/|$)/, read: [A('academics', 'curriculum')], write: [A('academics', 'curriculum')] },
  { name: 'library', re: /^\/academics\/library(\/|$)/, read: [A('academics', 'library')], write: [A('academics', 'library')] },
  // School calendar page (the web never checks its calendar/circulars/consent sub-keys)
  { name: 'circular-acknowledge', re: /^\/school-calendar\/circulars\/[^/]+\/acknowledge$/, read: [A('school-calendar')], write: [A('school-calendar')], writeNeedsView: true },
  { name: 'school-calendar', re: /^\/school-calendar(\/|$)/, read: [A('school-calendar')], write: [A('school-calendar')] },
  // Events (the /events/public/* routes are @Public and never reach the guard with a user)
  { name: 'events', re: /^\/events(\/|$)/, read: [A('events')], write: [A('events')] },
];

export function matchRule(path: string): PolicyRule | undefined {
  return POLICY_RULES.find((r) => r.re.test(path));
}

/** '/api/v1/students/x?y=1' -> '/students/x' */
export function normalisePath(url: string): string {
  const p = String(url || '').split('?')[0].replace(/\/+$/, '') || '/';
  return p.replace(/^\/api\/v\d+(?=\/|$)/, '') || '/';
}

export const isReadMethod = (m: string) => ['GET', 'HEAD', 'OPTIONS'].includes(String(m || '').toUpperCase());

type Level = 'none' | 'view' | 'manage';
const rank = (l: Level) => (l === 'manage' ? 2 : l === 'view' ? 1 : 0);

/** Effective level for one alternative. With a sub: the sub-specific entry, else the module-wide one. Without: the best entry of the module. */
export function altLevel(access: Array<{ moduleKey: string; level: 'view' | 'manage'; subModuleKey?: string | null }> | null | undefined, alt: Alt): Level {
  if (!Array.isArray(access) || !access.length) return 'none';
  if (alt.sub) {
    const specific = access.find((m) => m && m.moduleKey === alt.module && m.subModuleKey === alt.sub);
    if (specific) return specific.level;
    const wide = access.find((m) => m && m.moduleKey === alt.module && !m.subModuleKey);
    return wide ? wide.level : 'none';
  }
  let best: Level = 'none';
  for (const m of access) if (m && m.moduleKey === alt.module && rank(m.level) > rank(best)) best = m.level;
  return best;
}

export interface Decision { allowed: boolean; required: 'view' | 'manage'; rule: string; label: string }

export function decide(rule: PolicyRule, method: string, access: Parameters<typeof altLevel>[0]): Decision {
  const read = isReadMethod(method) || !!rule.writeNeedsView;
  const alts = read ? rule.read : rule.write;
  const required: 'view' | 'manage' = read ? 'view' : 'manage';
  const allowed = alts.some((a) => rank(altLevel(access, a)) >= rank(required));
  const label = alts.map((a) => (a.sub ? `${a.module}:${a.sub}` : a.module)).join(' or ');
  return { allowed, required, rule: rule.name, label };
}
