export interface ModuleDefinition {
  id: string;
  name: string;
  category: 'Foundation' | 'People' | 'Finance' | 'Admissions' | 'Academics' | 'Students' | 'Intelligence';
  icon: string;
  description: string;
  requiredModules: string[];
  recommendedModules: string[];
  isCore: boolean;
  pricingTier: 'starter' | 'academic' | 'enterprise';
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: 'organization',
    name: 'Institution Setup',
    category: 'Foundation',
    icon: '🏫',
    description: 'Campus profiles, org structure, academic calendar, branding and multi-campus management.',
    requiredModules: [],
    recommendedModules: [],
    isCore: true,
    pricingTier: 'starter',
  },
  {
    id: 'compliance',
    name: 'Governance & Compliance',
    category: 'Foundation',
    icon: '🛡️',
    description: 'Policy management, audit trails, risk registers and regulatory compliance tracking.',
    requiredModules: ['organization'],
    recommendedModules: ['documents'],
    isCore: false,
    pricingTier: 'enterprise',
  },
  {
    id: 'documents',
    name: 'Documents & Workflow',
    category: 'Foundation',
    icon: '📋',
    description: 'Digital document management, multi-stage approvals, expiry tracking and e-signatures.',
    requiredModules: ['organization'],
    recommendedModules: [],
    isCore: false,
    pricingTier: 'starter',
  },
  {
    id: 'hr',
    name: 'Staff & HR',
    category: 'People',
    icon: '👥',
    description: 'Staff profiles, leave management, payroll processing, CPD tracking and appraisals.',
    requiredModules: ['organization'],
    recommendedModules: ['documents'],
    isCore: false,
    pricingTier: 'starter',
  },
  {
    id: 'teaching',
    name: 'Teaching Management',
    category: 'People',
    icon: '🎓',
    description: 'Lesson plans, classroom observations, CPD logs and teacher performance analytics.',
    requiredModules: ['organization', 'hr'],
    recommendedModules: ['curriculum'],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'finance',
    name: 'Finance',
    category: 'Finance',
    icon: '💰',
    description: 'Fee collection, invoices, budgets, expenses, payroll and full financial reporting.',
    requiredModules: ['organization'],
    recommendedModules: [],
    isCore: false,
    pricingTier: 'starter',
  },
  {
    id: 'procurement',
    name: 'Procurement',
    category: 'Finance',
    icon: '🛒',
    description: 'Purchase orders, vendor management, stock tracking and purchase approval workflows.',
    requiredModules: ['organization', 'finance'],
    recommendedModules: ['campus-ops', 'documents'],
    isCore: false,
    pricingTier: 'enterprise',
  },
  {
    id: 'campus-ops',
    name: 'Campus Operations',
    category: 'Finance',
    icon: '🏛️',
    description: 'Rooms, assets, maintenance requests, events, transport and facility scheduling.',
    requiredModules: ['organization'],
    recommendedModules: [],
    isCore: false,
    pricingTier: 'enterprise',
  },
  {
    id: 'admissions',
    name: 'Admissions',
    category: 'Admissions',
    icon: '📝',
    description: 'Full lifecycle — lead capture, applications, interviews, offers and enrollment.',
    requiredModules: ['organization', 'finance', 'documents'],
    recommendedModules: ['students'],
    isCore: false,
    pricingTier: 'starter',
  },
  {
    id: 'curriculum',
    name: 'Curriculum Intelligence',
    category: 'Academics',
    icon: '📚',
    description: 'SLO mapping, learning outcomes, standards alignment and curriculum gap analysis.',
    requiredModules: ['organization'],
    recommendedModules: ['teaching'],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'syllabus',
    name: 'Syllabus Tracking',
    category: 'Academics',
    icon: '📊',
    description: 'Real-time coverage tracking per class, teacher and subject with AI-powered alerts.',
    requiredModules: ['organization', 'curriculum'],
    recommendedModules: ['teaching'],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'timetable',
    name: 'Timetable Intelligence',
    category: 'Academics',
    icon: '🗓️',
    description: 'Smart scheduling engine with conflict detection, substitution and room allocation.',
    requiredModules: ['organization'],
    recommendedModules: ['teaching', 'campus-ops'],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'library',
    name: 'Library',
    category: 'Academics',
    icon: '📖',
    description: 'Book catalog, member management, issue & return tracking, fines and digital resources.',
    requiredModules: ['organization', 'students'],
    recommendedModules: [],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'students',
    name: 'Student 360',
    category: 'Students',
    icon: '🧑‍🎓',
    description: 'Complete student profile — attendance, academic history, behaviour and family records.',
    requiredModules: ['organization'],
    recommendedModules: [],
    isCore: false,
    pricingTier: 'starter',
  },
  {
    id: 'assessment',
    name: 'Assessment & Results',
    category: 'Students',
    icon: '📝',
    description: 'Tests, marks, GPA, report cards, parent result access and class performance analytics.',
    requiredModules: ['organization', 'students', 'curriculum', 'teaching'],
    recommendedModules: ['syllabus'],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'behaviour',
    name: 'Behaviour & Tarbiyah',
    category: 'Students',
    icon: '🌱',
    description: 'PBIS-aligned behaviour tracking with Islamic character development (Tarbiyah) built in.',
    requiredModules: ['organization', 'students', 'teaching', 'documents'],
    recommendedModules: [],
    isCore: false,
    pricingTier: 'academic',
  },
  {
    id: 'analytics',
    name: 'Analytics & Intelligence',
    category: 'Intelligence',
    icon: '🤖',
    description: 'Claude AI-powered insights, predictive analytics, KPI dashboards and smart recommendations.',
    requiredModules: ['organization'],
    recommendedModules: ['documents'],
    isCore: false,
    pricingTier: 'enterprise',
  },
];

export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

// Real per-module PKR/month pricing, by pricingTier - the actual answer to
// "how much should this school be billed given exactly the modules it has
// active", not a guess. A core module (isCore: true, currently just
// 'organization') is bundled free with every account, same as every flat
// SUBSCRIPTION_PLANS tier already implicitly included Institution Setup.
// Separate from SUBSCRIPTION_PLANS (super-admin.schema.ts) deliberately -
// that config is the overall account tier (trial length, seat caps), this
// is what actually drives ModulesService's recomputed monthlyRevenue once
// a school's real activeModules set is known.
export const MODULE_PRICE_PKR: Record<ModuleDefinition['pricingTier'], number> = {
  starter: 1499,
  academic: 2999,
  enterprise: 5999,
};

// ============================================================
// SCHOOL PACKAGES — the canonical Starter / Growth / Enterprise tiers
// ============================================================
// Deliberately NOT a separately hand-maintained list of module ids per
// package (that drifts from the registry the moment a module is added or
// its tier changes). Each module already carries the right pricingTier
// above - including a dependency graph that was authored tier-aware
// (e.g. 'academic' modules only ever require 'starter' modules) - so a
// package is just "every module at or below this tier", cumulative.
// Starter = pricingTier 'starter' only; Growth = + 'academic'; Enterprise
// = every module. This is also why a package's module set never needs
// its own dependency validation - it's already internally consistent.
export type SchoolPlan = 'starter' | 'growth' | 'enterprise';

const PLAN_TIERS: Record<SchoolPlan, ModuleDefinition['pricingTier'][]> = {
  starter: ['starter'],
  growth: ['starter', 'academic'],
  enterprise: ['starter', 'academic', 'enterprise'],
};

// Pre-'growth' plan values still sitting on old Institution/Tenant
// documents (the platform used 'professional'/'academic'/'operations'
// before Starter/Growth/Enterprise existed as a named package) - treated
// as 'growth' here rather than requiring a database migration.
const LEGACY_PLAN_ALIASES: Record<string, SchoolPlan> = {
  professional: 'growth',
  academic: 'growth',
  operations: 'growth',
  free_trial: 'starter',
  trial: 'starter',
};

function normalizePlan(plan: string): SchoolPlan {
  if (plan in PLAN_TIERS) return plan as SchoolPlan;
  return LEGACY_PLAN_ALIASES[plan] || 'starter';
}

export function modulesForPlan(plan: string): string[] {
  const tiers = PLAN_TIERS[normalizePlan(plan)];
  return MODULE_REGISTRY.filter((m) => tiers.includes(m.pricingTier)).map((m) => m.id);
}

export function isModuleInPlan(moduleId: string, plan: string): boolean {
  return modulesForPlan(plan).includes(moduleId);
}

export function computeModulePricing(activeModuleIds: string[]): {
  monthlyRevenue: number;
  lineItems: { moduleId: string; name: string; pricingTier: string; price: number }[];
} {
  const lineItems = activeModuleIds
    .map((id) => getModuleById(id))
    .filter((m): m is ModuleDefinition => !!m && !m.isCore)
    .map((m) => ({ moduleId: m.id, name: m.name, pricingTier: m.pricingTier, price: MODULE_PRICE_PKR[m.pricingTier] }));
  const monthlyRevenue = lineItems.reduce((sum, li) => sum + li.price, 0);
  return { monthlyRevenue, lineItems };
}
