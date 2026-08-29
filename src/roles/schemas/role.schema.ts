import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoleDocument = Role & Document;

// Matches the resource part of the frontend's Permission type
// ('hr:view' / 'hr:manage', etc.) — keep this list in sync with
// src/types/roles.ts on the frontend if a new module is ever added.
export const ASSIGNABLE_MODULES = [
  { key: 'institution', label: 'Institution Setup' },
  { key: 'governance', label: 'Governance & Compliance' },
  { key: 'documents', label: 'Documents & Workflow' },
  { key: 'hr', label: 'Staff & HR' },
  { key: 'teaching', label: 'Teaching Management' },
  { key: 'finance', label: 'Finance' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'campus', label: 'Campus Operations' },
  { key: 'admissions', label: 'Admissions' },
  { key: 'students', label: 'Student 360' },
  { key: 'academics', label: 'Curriculum Intelligence' },
  { key: 'assessments', label: 'Assessment & Results' },
  { key: 'behaviour', label: 'Behaviour & Tarbiyah' },
  { key: 'analytics', label: 'Analytics & Intelligence' },
  { key: 'apps', label: 'Apps & Modules' },
  { key: 'report-templates', label: 'Report Templates' },
] as const;

export type ModuleAccessLevel = 'none' | 'view' | 'manage';

@Schema({ _id: false })
export class ModuleAccess {
  @Prop({ required: true }) moduleKey: string;
  @Prop({ enum: ['view', 'manage'], required: true }) level: 'view' | 'manage';
  // Optional sub-module granularity within a module (e.g. finance's
  // 'ledger' vs 'payable'). Omitted/null on an entry — including every
  // entry ever saved before sub-modules existed — means the entry applies
  // to the WHOLE module, exactly as it always has. This is purely additive:
  // no migration is needed and no existing Role document changes meaning.
  @Prop({ type: String, default: null }) subModuleKey?: string | null;
}
export const ModuleAccessSchema = SchemaFactory.createForClass(ModuleAccess);

// Sub-module registry, one entry per ASSIGNABLE_MODULES key. Grounded in
// each module's real frontend tabs (see each page's own Tab type) so the
// Edit Role modal's tree structure names things the way staff already see
// them. A module with no meaningful sub-division still gets exactly one
// sub-module (matching the module itself) rather than a forced breakdown.
export const SUB_MODULES: Record<string, { key: string; label: string }[]> = {
  institution: [
    { key: 'dashboard', label: 'Overview' },
    { key: 'institutions', label: 'Institutions' },
    { key: 'campuses', label: 'Campuses' },
    { key: 'departments', label: 'Departments' },
    { key: 'grades', label: 'Classes & Sections' },
    { key: 'academicYears', label: 'Academic Years' },
    { key: 'delegations', label: 'Authority Delegation' },
    { key: 'committees', label: 'Committees' },
    { key: 'board', label: 'Board' },
    { key: 'policies', label: 'Policies' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'workflows', label: 'Workflows' },
    { key: 'audit', label: 'Audit Logs' },
  ],
  governance: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'rbac', label: 'RBAC' },
    { key: 'audit', label: 'Audit Logs' },
    { key: 'privacy', label: 'Data Privacy' },
    { key: 'safeguarding', label: 'Safeguarding' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'accreditation', label: 'Accreditation' },
    { key: 'governance', label: 'Governance' },
    { key: 'documents', label: 'Documents' },
    { key: 'policies', label: 'Policies' },
    { key: 'complaints', label: 'Complaints' },
    { key: 'settings', label: 'Settings' },
  ],
  documents: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'documents', label: 'Documents' },
    { key: 'workflows', label: 'Workflows' },
    { key: 'wfbuilder', label: 'Workflow Builder' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'esignatures', label: 'E-Signatures' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'audit', label: 'Audit Trail' },
    { key: 'permissions', label: 'Permissions' },
  ],
  hr: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'employees', label: 'Employees' },
    { key: 'lifecycle', label: 'Lifecycle' },
    { key: 'recruitment', label: 'Recruitment' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'leave', label: 'Leave' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'payslip', label: 'Payslips' },
    { key: 'performance', label: 'Performance' },
    { key: 'training', label: 'Training' },
    { key: 'contracts', label: 'Contracts' },
    { key: 'exit', label: 'Exit' },
    { key: 'settings', label: 'Settings' },
    { key: 'grievance', label: 'Grievance' },
    { key: 'worksummary', label: 'Work Summary' },
    { key: 'expenses', label: 'Expense Claims' },
    { key: 'reports', label: 'Reports' },
  ],
  teaching: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'profile', label: 'Teacher Profile' },
    { key: 'lesson-plans', label: 'Lesson Plans' },
    { key: 'timetable', label: 'Timetable' },
    { key: 'fixtures', label: 'Fixture Management' },
    { key: 'ptm', label: 'Parent Meetings' },
    { key: 'syllabus', label: 'Syllabus' },
    { key: 'assessments', label: 'Assessments' },
    { key: 'behaviour', label: 'Behaviour' },
    { key: 'homework', label: 'Homework' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'appraisal', label: 'Appraisal' },
    { key: 'analytics', label: 'Analytics' },
  ],
  // Finance's sub-module keys are the SAME strings as the frontend's FinTab
  // union (src/pages/finance/index.tsx) — deliberately, so the backend
  // guard, this registry, and the frontend tabs never drift out of sync.
  finance: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'fee', label: 'Fee & Revenue' },
    { key: 'assignments', label: 'Fee Assignment' },
    { key: 'receivable', label: 'Receivables' },
    { key: 'defaulters', label: 'Defaulters' },
    { key: 'payable', label: 'Payables' },
    { key: 'vouchers', label: 'Vouchers' },
    { key: 'banking', label: 'Banking' },
    { key: 'reconciliation', label: 'Bank Reconciliation' },
    { key: 'budgeting', label: 'Budgeting' },
    { key: 'islamic', label: 'Islamic Funds' },
    { key: 'ledger', label: 'Ledger' },
    { key: 'reports', label: 'Reports' },
    { key: 'audit', label: 'Audit' },
  ],
  procurement: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'requisitions', label: 'Requisitions' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'purchase-orders', label: 'Purchase Orders' },
    { key: 'grn', label: 'GRN' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'assets', label: 'Assets' },
    { key: 'reports', label: 'Reports' },
  ],
  campus: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'buildings', label: 'Buildings' },
    { key: 'rooms', label: 'Rooms' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'transport', label: 'Transport' },
    { key: 'hostel', label: 'Hostel' },
    { key: 'security', label: 'Security' },
    { key: 'utilities', label: 'Utilities' },
    { key: 'reports', label: 'Reports' },
  ],
  admissions: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'leads', label: 'Leads' },
    { key: 'applicants', label: 'Applicants' },
    { key: 'evaluation', label: 'Evaluation' },
    { key: 'enrollment', label: 'Enrollment' },
    { key: 'retention', label: 'Retention' },
    { key: 'reports', label: 'Reports' },
  ],
  students: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'students', label: 'Students' },
    { key: 'guardians', label: 'Guardians' },
    { key: 'families', label: 'Families' },
    { key: 'attendance', label: 'Attendance' },
  ],
  academics: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'curriculum', label: 'Curriculum' },
    { key: 'syllabus', label: 'Syllabus Manager' },
    { key: 'timetable', label: 'Timetable Intelligence' },
    { key: 'library', label: 'Library' },
  ],
  assessments: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'planner', label: 'Planner' },
    { key: 'questions', label: 'Question Bank' },
    { key: 'papers', label: 'Paper Generation' },
    { key: 'marks', label: 'Mark Entry' },
    { key: 'results', label: 'Results' },
    { key: 'analytics', label: 'Analytics' },
  ],
  behaviour: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'records', label: 'Records' },
    { key: 'tarbiyah', label: 'Tarbiyah' },
    { key: 'counselling', label: 'Counselling' },
    { key: 'interventions', label: 'Interventions' },
    { key: 'reports', label: 'Reports' },
  ],
  analytics: [
    { key: 'overview', label: 'Overview' },
    { key: 'academic', label: 'Academic Intelligence' },
    { key: 'students', label: 'Student Intelligence' },
    { key: 'financial', label: 'Financial Intelligence' },
    { key: 'admissions', label: 'Admissions Intelligence' },
    { key: 'behaviour', label: 'Behaviour Intelligence' },
    { key: 'ai', label: 'AI Insights' },
  ],
  // Single-screen modules — no meaningful sub-division, so each gets one
  // sub-module matching the module itself rather than a forced breakdown.
  apps: [{ key: 'apps', label: 'Apps & Modules' }],
  'report-templates': [{ key: 'report-templates', label: 'Report Templates' }],
};

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({ default: '#0C447C' }) color: string;
  // Only modules explicitly listed here are granted — anything not present
  // means no access at all, which is the safe default for a brand-new role.
  @Prop({ type: [ModuleAccessSchema], default: [] })
  moduleAccess: ModuleAccess[];
  // A handful of built-in roles (Teacher, Finance Officer, etc.) ship as
  // read-only starting points — schools can duplicate and customize them,
  // but not edit/delete the originals, so there's always a safe fallback.
  @Prop({ default: false }) isSystemDefault: boolean;
  @Prop() createdBy: string;
}
export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ schoolSlug: 1, name: 1 }, { unique: true });
