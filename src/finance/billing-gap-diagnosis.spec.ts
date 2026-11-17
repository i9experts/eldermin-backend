import { FinanceService } from './finance.service';

// Regression coverage for FinanceService.diagnoseNoInvoices/getBillingGaps -
// an empty Fee Ledger (Student 360, parent app) is ambiguous on its own:
// identical whether a student genuinely owes nothing or was simply never
// billed (inactive status, no matching Fee Structure, or Generate Invoices
// was never run for them). These give staff/parents the real reason instead
// of a bare "No invoices found".

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(38).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (FinanceService as any)(...params);
}

const FEE_STRUCT_IDX = 1;
const INVOICE_IDX = 2;
const STUDENT_FEE_ASSIGNMENT_IDX = 9;
const STUDENT_IDX = 28;
const CAMPUS_IDX = 30;

const STUDENT = {
  _id: 's1', firstName: 'Ayesha', lastName: 'Siddiqua', status: 'active',
  currentGrade: 'Grade 3', currentSection: 'A', campusId: 'c1',
};

const MATCHING_STRUCTURE = {
  _id: 'fs1', name: 'Grade 3 Tuition', grade: 'Grade 3', section: null, campus: null,
  isActive: true, items: [{ feeHead: 'Tuition Fee', amount: 5000 }],
};

function makeModels(overrides: { student?: any; feeStructures?: any[]; campus?: any; studentFeeAssignments?: any[] }) {
  const studentModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.student ?? null) }) };
  const feeStructModel: any = {
    find: () => ({ lean: () => Promise.resolve(overrides.feeStructures ?? []) }),
    findOne: () => ({ lean: () => Promise.resolve(null) }),
  };
  const campusModel: any = { findById: () => ({ lean: () => Promise.resolve(overrides.campus ?? null) }) };
  const studentFeeAssignmentModel: any = {
    find: () => ({ sort: () => ({ lean: () => Promise.resolve(overrides.studentFeeAssignments ?? []) }) }),
  };
  return { studentModel, feeStructModel, campusModel, studentFeeAssignmentModel };
}

describe('FinanceService.diagnoseNoInvoices', () => {
  it('reports inactive_status when the student is not active', async () => {
    const { studentModel, feeStructModel, campusModel, studentFeeAssignmentModel } = makeModels({ student: { ...STUDENT, status: 'transferred' } });
    const svc = makeService({ [STUDENT_IDX]: studentModel, [FEE_STRUCT_IDX]: feeStructModel, [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel });
    const result = await svc.diagnoseNoInvoices('demo-school', 's1');
    expect(result.reason).toBe('inactive_status');
    expect(result.detail).toContain('transferred');
  });

  it('reports no_fee_structure_assigned when nothing matches the student\'s grade/section/campus and no explicit assignment exists', async () => {
    const { studentModel, feeStructModel, campusModel, studentFeeAssignmentModel } = makeModels({ student: STUDENT, feeStructures: [] });
    const svc = makeService({ [STUDENT_IDX]: studentModel, [FEE_STRUCT_IDX]: feeStructModel, [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel });
    const result = await svc.diagnoseNoInvoices('demo-school', 's1');
    expect(result.reason).toBe('no_fee_structure_assigned');
    expect(result.detail).toContain('Grade 3 - A');
  });

  it('reports not_yet_generated when a Fee Structure auto-matches the class but no invoice has been created', async () => {
    const { studentModel, feeStructModel, campusModel, studentFeeAssignmentModel } = makeModels({ student: STUDENT, feeStructures: [MATCHING_STRUCTURE] });
    const svc = makeService({ [STUDENT_IDX]: studentModel, [FEE_STRUCT_IDX]: feeStructModel, [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel });
    const result = await svc.diagnoseNoInvoices('demo-school', 's1');
    expect(result.reason).toBe('not_yet_generated');
    expect(result.detail).toContain('Generate Invoices');
  });

  it('reports not_yet_generated when an explicit, currently-active StudentFeeAssignment covers this student', async () => {
    const assignment = { feeStructureId: 'fs1', effectiveFrom: new Date('2020-01-01'), effectiveTo: null };
    const { studentModel, feeStructModel, campusModel, studentFeeAssignmentModel } = makeModels({
      student: STUDENT, feeStructures: [MATCHING_STRUCTURE], studentFeeAssignments: [assignment],
    });
    const svc = makeService({ [STUDENT_IDX]: studentModel, [FEE_STRUCT_IDX]: feeStructModel, [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel });
    const result = await svc.diagnoseNoInvoices('demo-school', 's1');
    expect(result.reason).toBe('not_yet_generated');
    expect(result.detail).toContain('explicit fee assignment');
  });

  it('reports student_not_found when the id does not resolve to a student in this school', async () => {
    const { studentModel, feeStructModel, campusModel, studentFeeAssignmentModel } = makeModels({ student: null });
    const svc = makeService({ [STUDENT_IDX]: studentModel, [FEE_STRUCT_IDX]: feeStructModel, [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel });
    const result = await svc.diagnoseNoInvoices('demo-school', 'missing');
    expect(result.reason).toBe('student_not_found');
  });
});

describe('FinanceService.getBillingGaps', () => {
  it('reports every active student who has never had an invoice, each with their own diagnosis', async () => {
    const students = [
      { _id: 's1', firstName: 'Ayesha', lastName: 'Siddiqua', rollNumber: 'R-1', currentGrade: 'Grade 3', currentSection: 'A', campusId: 'c1', status: 'active' },
      { _id: 's2', firstName: 'Yahya', lastName: 'Mala', rollNumber: 'R-2', currentGrade: 'Grade 3', currentSection: 'A', campusId: 'c1', status: 'active' },
    ];
    const studentModel: any = {
      find: (filter: any) => ({ select: () => ({ lean: () => Promise.resolve(students) }) }),
      findOne: () => ({ lean: () => Promise.resolve(students[0]) }),
    };
    const invoiceModel: any = { find: () => ({ lean: () => Promise.resolve([]) }) };
    const feeStructModel: any = { find: () => ({ lean: () => Promise.resolve([]) }), findOne: () => ({ lean: () => Promise.resolve(null) }) };
    const campusModel: any = { findById: () => ({ lean: () => Promise.resolve(null) }) };
    const studentFeeAssignmentModel: any = { find: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }) };

    const svc = makeService({
      [STUDENT_IDX]: studentModel, [INVOICE_IDX]: invoiceModel, [FEE_STRUCT_IDX]: feeStructModel,
      [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel,
    });
    // diagnoseNoInvoices re-fetches the student by id - stub findOne per id.
    studentModel.findOne = ({ _id }: any) => ({ lean: () => Promise.resolve(students.find((s) => s._id === _id) ?? null) });

    const result = await svc.getBillingGaps('demo-school', {});
    expect(result.totalChecked).toBe(2);
    expect(result.gaps).toHaveLength(2);
    expect(result.gaps.map((g: any) => g.name).sort()).toEqual(['Ayesha Siddiqua', 'Yahya Mala']);
    expect(result.gaps.every((g: any) => g.reason === 'no_fee_structure_assigned')).toBe(true);
  });

  it('excludes students who already have at least one invoice', async () => {
    const students = [
      { _id: 's1', firstName: 'Billed', lastName: 'Student', currentGrade: 'Grade 3', campusId: 'c1', status: 'active' },
      { _id: 's2', firstName: 'Unbilled', lastName: 'Student', currentGrade: 'Grade 3', campusId: 'c1', status: 'active' },
    ];
    const studentModel: any = {
      find: () => ({ select: () => ({ lean: () => Promise.resolve(students) }) }),
      findOne: ({ _id }: any) => ({ lean: () => Promise.resolve(students.find((s) => s._id === _id) ?? null) }),
    };
    const invoiceModel: any = { find: () => ({ lean: () => Promise.resolve([{ studentId: 's1' }]) }) };
    const feeStructModel: any = { find: () => ({ lean: () => Promise.resolve([]) }), findOne: () => ({ lean: () => Promise.resolve(null) }) };
    const campusModel: any = { findById: () => ({ lean: () => Promise.resolve(null) }) };
    const studentFeeAssignmentModel: any = { find: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }) };

    const svc = makeService({
      [STUDENT_IDX]: studentModel, [INVOICE_IDX]: invoiceModel, [FEE_STRUCT_IDX]: feeStructModel,
      [CAMPUS_IDX]: campusModel, [STUDENT_FEE_ASSIGNMENT_IDX]: studentFeeAssignmentModel,
    });
    const result = await svc.getBillingGaps('demo-school', {});
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].name).toBe('Unbilled Student');
  });

  it('returns no gaps without checking anyone when every student has an invoice', async () => {
    const students = [{ _id: 's1', firstName: 'Billed', lastName: 'Student', currentGrade: 'Grade 3', campusId: 'c1', status: 'active' }];
    const studentModel: any = { find: () => ({ select: () => ({ lean: () => Promise.resolve(students) }) }) };
    const invoiceModel: any = { find: () => ({ lean: () => Promise.resolve([{ studentId: 's1' }]) }) };
    const svc = makeService({ [STUDENT_IDX]: studentModel, [INVOICE_IDX]: invoiceModel });
    const result = await svc.getBillingGaps('demo-school', {});
    expect(result.totalChecked).toBe(1);
    expect(result.gaps).toEqual([]);
  });
});
