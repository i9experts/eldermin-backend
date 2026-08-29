// ============================================================
// SEED: Knowledge Base Articles — Staff & HR module (17 tabs)
// Eldermin ERP | run with: npm run seed:kb
//
// KB content is GLOBAL platform content (not tenant-scoped), so this
// seeds one shared collection rather than looping per school. Safe to
// re-run: each article is upserted by (module, tabKey), so running
// this again just refreshes the seeded copy rather than duplicating.
// ============================================================

import { webcrypto } from 'crypto';
// Node 20+ already defines globalThis.crypto as a read-only getter, so an
// unconditional assignment throws ("Cannot set property crypto of #<Object>
// which has only a getter") the moment this module is imported - and it now
// is, at every app boot, via KnowledgeBaseService's `import { hrArticles }`.
// Guard it exactly like main.ts already does.
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

export const hrArticles = [
  {
    module: 'hr', tabKey: 'dashboard', order: 1,
    title: 'Dashboard',
    tagline: "Your morning read on the whole staff — who's in, who's owed, what needs a decision today.",
    body: 'Every time you open Staff & HR, this is the screen you land on. It pulls live numbers from every other tab, so there is nothing to refresh and nothing to configure before it means something.',
    steps: [
      'Check the top row first: Present / On Leave / Payroll / Onboarding / Open Positions tell you if today is normal before you dig deeper.',
      'Use the six Quick Action tiles for the tasks you repeat daily — Add Employee, Mark Attendance, Process Payroll, Apply Leave.',
      'Export pulls the same numbers into a spreadsheet for a board pack or a campus meeting.',
    ],
  },
  {
    module: 'hr', tabKey: 'employees', order: 2,
    title: 'Employees',
    tagline: 'The single source of truth for every person on payroll — one record, every campus.',
    body: 'This is the master directory. Every other HR tab (payroll, leave, contracts, exit) reads from the record you create here, so getting a hire right in Employees means you never re-type their name again.',
    steps: [
      "Click + Add Employee for a single new hire — the wizard walks through all 9 sections and won't let you skip a required field.",
      'Onboarding a whole campus at once? Use Bulk Import: download the template, fill it in Excel, upload, then review before it commits.',
      'To change anything about an existing employee — salary, contact details, qualifications — open their profile and click Edit, not a new enrollment.',
      "Create Login Accounts (next to Export) issues portal logins in bulk for staff who don't have one yet.",
    ],
  },
  {
    module: 'hr', tabKey: 'lifecycle', order: 3,
    title: 'Lifecycle',
    tagline: 'One pipeline view from first application to active staff member.',
    body: "Lifecycle is the bird's-eye view of everyone who isn't fully onboarded yet — candidates moving through interview stages, offers pending, and new hires still being onboarded — all on one board.",
    steps: [
      'Use Lifecycle to see, at a glance, whether hiring is stuck at a particular stage (e.g. everyone piling up in "Interview").',
      'A candidate here can be moved forward without re-entering their details — the same record follows them from Candidate to Active Employee.',
    ],
  },
  {
    module: 'hr', tabKey: 'recruitment', order: 4,
    title: 'Recruitment',
    tagline: 'Post the job, collect applications, run interviews — all in one place.',
    body: 'Recruitment is where a vacancy actually starts: posting the opening, tracking who applied, and scheduling interviews. Once someone is selected, they move into the Lifecycle pipeline.',
    steps: [
      'Set up Hiring Settings once per school year — the interview stages you define here appear as the columns in every future pipeline.',
      'Create Job Opening to post a vacancy; applicants who apply (or that you add manually) show up under the Applications tab.',
      'Move a strong applicant into the Lifecycle board directly from here once they clear screening.',
    ],
  },
  {
    module: 'hr', tabKey: 'onboarding', order: 5,
    title: 'Onboarding',
    tagline: "Checklist-driven ramp-up for every new hire, so nothing gets forgotten in the first week.",
    body: 'Onboarding tracks the tasks a new hire and their manager need to complete before day one — IT access, document collection, orientation.',
    steps: [
      'Open Staff & HR → Onboarding from the top tab bar.',
      'A candidate marked "Offered" in Lifecycle moves into Onboarding automatically once the offer is accepted.',
    ],
  },
  {
    module: 'hr', tabKey: 'attendance', order: 6,
    title: 'Attendance',
    tagline: 'Daily presence, shifts, and the rules that turn a check-in time into "present", "late" or "half-day".',
    body: "Attendance is the daily operational tab — mark who's in, and it feeds directly into Payroll's late/absence deductions and Leave's balance tracking.",
    steps: [
      'Set up Shifts and Attendance Settings once, before your first real attendance day — everything downstream depends on these.',
      'Each school day, open Mark Attendance, tap the right status pill per person, then Save Marked.',
      "If your campus has biometric hardware, connect it once under Biometric Integration instead of marking by hand every day.",
    ],
  },
  {
    module: 'hr', tabKey: 'leave', order: 7,
    title: 'Leave',
    tagline: 'Apply, approve, and track leave balances by type — Annual, Sick, Casual, Maternity, Hajj.',
    body: "Leave is the approval workflow for time off. Balances shown here are live — they update the moment a leave request is approved, and Attendance/Payroll read from the same numbers.",
    steps: [
      "Check Policies & Balances to see or adjust each leave type's entitlement per staff member.",
      "+ Apply Leave on behalf of a staff member who's asked you directly, or let staff apply from their own portal.",
      "A pending request sits under Pending until approved or rejected — approving updates their balance immediately.",
    ],
  },
  {
    module: 'hr', tabKey: 'payroll', order: 8,
    title: 'Payroll',
    tagline: 'Define what staff are paid, run payroll monthly, and post it to the ledger.',
    body: 'Payroll has three layers, in order: Salary Components (the building blocks — allowances, deductions), Salary Templates (reusable packages like "Teacher" or "Admin Staff"), and the actual monthly Payroll Run.',
    steps: [
      'Set up Salary Components and Salary Templates once at the start of the year (or when policy changes).',
      'Each month, click + New Payroll Run, pick the period, review the salary table line by line, then process.',
      'A processed run shows as paid; a run still being reviewed shows processing and can be Resumed or Cancelled.',
    ],
  },
  {
    module: 'hr', tabKey: 'payslip', order: 9,
    title: 'Payslips',
    tagline: 'The individual, itemized record for every staff member, every pay period.',
    body: 'Payslips are generated from a processed Payroll Run — one per staff member per period, with attendance-based net pay already applied.',
    steps: [
      'Payslips generate automatically for everyone included in a Payroll Run — you rarely need to create one individually.',
      "A draft payslip can still be corrected; once finalized it becomes the official record for that staff member's pay period.",
    ],
  },
  {
    module: 'hr', tabKey: 'performance', order: 10,
    title: 'Performance',
    tagline: 'Structured reviews with role-specific criteria — not a single generic rating scale.',
    body: 'Performance reviews are built around real teaching/role criteria (e.g. Lesson Planning & Curriculum Coverage for teachers), grouped into weighted categories, so a review reflects the actual job.',
    steps: [
      '+ Start Review, choose the staff member and review type, and optionally require a self-review first.',
      "Every review moves through Self Review → Manager Review → Summary → History, so both sides' input is captured before a final rating is set.",
    ],
  },
  {
    module: 'hr', tabKey: 'training', order: 11,
    title: 'Training',
    tagline: 'Schedule CPD sessions, track completion, and keep a record of who has been trained on what.',
    body: 'Training covers everything from a one-off workshop to mandatory annual CPD hours, with Cards, List and Calendar views of the same schedule.',
    steps: [
      '+ Schedule Training to create a new session — mark it Mandatory if attendance is required for compliance.',
      'Switch between Upcoming / Ongoing / Completed / Cancelled to track a session through its lifecycle.',
      'Use "Show CPD Tracker" to see cumulative professional-development hours per staff member.',
    ],
  },
  {
    module: 'hr', tabKey: 'contracts', order: 12,
    title: 'Contracts',
    tagline: 'Employment contracts and offer letters, generated from reusable templates with real data merged in.',
    body: 'Contracts covers two related documents — the employment Contract itself and separate Offer Letters — both built from templates so you write the legal language once and reuse it for every hire.',
    steps: [
      'Build your Contract Templates once (Permanent, Probation, Part-Time...) using the variable placeholders.',
      'For each new hire, click + New Contract, select them and the right template — most fields fill in automatically.',
      'Offer Letters follow the same pattern under the Offer Letters sub-tab, separate from signed employment Contracts.',
    ],
  },
  {
    module: 'hr', tabKey: 'exit', order: 13,
    title: 'Exit',
    tagline: "Resignations and terminations, with a clearance checklist so nothing — a laptop, a library book — gets missed.",
    body: 'Exit management standardizes what should happen whenever someone leaves: a notice period appropriate to their employment type, a clearance checklist across departments, and final settlement figures.',
    steps: [
      'Configure Exit Settings once — notice periods and the clearance checklist apply to every future exit automatically.',
      'When someone resigns or is terminated, click + Process Exit and fill in the resignation/last-working-day details.',
      'Clearance items (IT, Library, Finance...) must be checked off before the exit record can be closed out.',
    ],
  },
  {
    module: 'hr', tabKey: 'grievance', order: 14,
    title: 'Grievance',
    tagline: "A confidential channel for staff concerns, tracked with priority and an SLA — nothing gets lost in an inbox.",
    body: "Grievance gives every case a category, a priority, and — critically — an option to keep the reporting staff member's identity confidential from everyone except whoever is assigned to handle it.",
    steps: [
      '+ Submit Grievance to log a new case — on behalf of a staff member, or for them to submit themselves via their portal.',
      'Filter the case list by priority, category or status; an overdue case (past its SLA) is flagged in red automatically.',
      'Assign each case to a specific handler from the Assigned To column — an unassigned case is easy to lose track of.',
    ],
  },
  {
    module: 'hr', tabKey: 'worksummary', order: 15,
    title: 'Work Summary',
    tagline: 'A lightweight daily log of what each staff member actually worked on — not a timesheet, a record.',
    body: "Work Summary is the simplest tab in the module by design: one free-text entry per person per day, an optional task checklist, and a workload flag — enough to spot who's overloaded without turning it into admin busywork.",
    steps: [
      "Encourage staff to log their own summary from their portal — it takes under a minute.",
      '+ Log Summary to fill one in on someone\'s behalf if needed, as an admin.',
      "Watch the Missing count on days it stays high — it usually means the habit hasn't stuck yet, not that no one worked.",
    ],
  },
  {
    module: 'hr', tabKey: 'expenses', order: 16,
    title: 'Expense Claims',
    tagline: 'Staff-submitted reimbursement requests, with a choice of how they actually get paid out.',
    body: 'Expense Claims covers day-to-day reimbursements — travel, supplies, anything a staff member paid for out of pocket — separate from the Advances tab for money given to staff in advance.',
    steps: [
      '+ New Claim to submit a reimbursement — attach the category and amount, and pick how it should be paid back.',
      '"Net into next payslip" is usually simplest — the amount is added automatically to that staff member\'s next payroll run.',
      "Track money already advanced to staff separately under the Advances tab so it doesn't get double-counted.",
    ],
  },
  {
    module: 'hr', tabKey: 'reports', order: 17,
    title: 'HR Reports',
    tagline: 'Headcount, turnover, leave and performance analytics, built live from your actual HR data.',
    body: "HR Reports isn't a separate reporting database — every number here is computed live from the same Employees, Leave, Exit and Performance records you've already been working with in the other tabs.",
    steps: [
      'Four ready-made reports: Headcount by Department, Turnover & Exit Reasons, Leave Utilization, Performance Rating Distribution.',
      'Click Generate to view a report on screen, or Export to get a file straight away for a meeting or board pack.',
    ],
  },
  {
    module: 'hr', tabKey: 'settings', order: 18,
    title: 'HR Settings',
    tagline: 'Every configuration screen the rest of the module depends on, gathered in one place.',
    body: 'HR Settings is the control room — it\'s where Shifts, Attendance rules, Exit checklists, Hiring stages, Leave policies and Salary Components (all in their own tabs) are actually configured.',
    steps: [
      'Start here on day one — configuring these six areas correctly is what makes every other tab behave the way your school actually works.',
      'Nothing in Staff & HR is hardcoded: every fee amount, threshold and template is something you define here, editable any time policy changes.',
    ],
  },
];

async function seedKbArticles() {
  console.log('Starting KB articles seed...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const kbArticleModel = app.get(getModelToken('KbArticle'));

  for (const article of hrArticles) {
    const result = await kbArticleModel.findOneAndUpdate(
      { module: article.module, tabKey: article.tabKey },
      { $set: article },
      { upsert: true, new: true },
    );
    console.log(`[${article.module}/${article.tabKey}] Upserted: ${result.title}`);
  }

  console.log(`KB articles seed complete. ${hrArticles.length} articles seeded/refreshed.`);
  await app.close();
  process.exit(0);
}

// Only self-run when executed directly (`npm run seed:kb`), not when
// `hrArticles` is imported elsewhere (e.g. by the KnowledgeBaseService's
// HTTP-triggerable seedDefaults() bootstrap) - otherwise importing this
// module anywhere (including in tests) would try to boot a second Nest
// app and connect to a real database as a side effect of import alone.
if (require.main === module) {
  seedKbArticles().catch((err) => {
    console.error('KB articles seed failed:', err);
    process.exit(1);
  });
}
