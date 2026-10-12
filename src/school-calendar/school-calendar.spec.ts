import { SchoolCalendarService } from './school-calendar.service';

// Fakes only (no DB).
const chain = (v: any) => {
  const c: any = { select: () => c, sort: () => c, limit: () => c, lean: () => Promise.resolve(v), then: (r: any, j: any) => Promise.resolve(v).then(r, j) };
  return c;
};

export function makeCalendar(opts: any = {}) {
  const eventModel: any = { find: jest.fn(() => chain(opts.manual ?? [])) };
  const invoiceModel: any = { find: jest.fn(() => chain(opts.invoices ?? [{ dueDate: new Date('2026-10-20T00:00:00Z'), balanceDue: 1500 }])) };
  const assessmentModel: any = { find: jest.fn(() => chain(opts.assessments ?? [])) };
  const academicYearModel: any = { find: jest.fn(() => chain([])) };
  const circularModel: any = {
    find: jest.fn(() => chain(opts.circulars ?? [])),
    findOne: jest.fn(() => chain(opts.circular ?? null)),
  };
  const ackModel: any = { findOneAndUpdate: jest.fn(async () => ({})), find: jest.fn(() => chain(opts.acks ?? [])) };
  const staffModel: any = { findOne: jest.fn(() => chain(opts.staff ?? null)), find: jest.fn(() => chain([])) };
  const userModel: any = { find: jest.fn(() => chain([])), findOne: jest.fn(() => chain(opts.userDoc ?? null)) };
  const tenantModel: any = { findOne: jest.fn(() => chain({ _id: 't1' })) };
  const noop: any = {};
  const service = new SchoolCalendarService(
    eventModel, circularModel, ackModel, invoiceModel, noop, staffModel, userModel, tenantModel, noop, assessmentModel, academicYearModel, noop,
  );
  return { service, eventModel, invoiceModel, assessmentModel, circularModel, ackModel, staffModel, userModel };
}

const range = { from: '2026-10-01', to: '2026-10-31' };

describe('SchoolCalendarService.getEvents (fee rows)', () => {
  it.each(['admin', 'principal', 'finance_manager', 'parent', 'institution_owner'])('%s still gets the fee-due rows (unchanged)', async (role) => {
    const { service, invoiceModel } = makeCalendar();
    const rows: any[] = await service.getEvents('s', range, { role });
    expect(invoiceModel.find).toHaveBeenCalled();
    const fee = rows.filter((r) => r.type === 'fee_due');
    expect(fee).toHaveLength(1);
    expect(fee[0]).toMatchObject({ source: 'finance', description: 'Total outstanding: 1500.00' });
  });

  it('no user (legacy call) keeps the fee rows', async () => {
    const { service } = makeCalendar();
    expect((await service.getEvents('s', range)).some((r: any) => r.type === 'fee_due')).toBe(true);
  });

  it('teacher: no fee rows, and the invoice collection is never read', async () => {
    const { service, invoiceModel } = makeCalendar({ manual: [{ title: 'Holiday', type: 'holiday', startDate: new Date('2026-10-10'), endDate: new Date('2026-10-10') }] });
    const rows: any[] = await service.getEvents('s', range, { role: 'teacher' });
    expect(invoiceModel.find).not.toHaveBeenCalled();
    expect(rows.some((r) => r.type === 'fee_due' || r.source === 'finance')).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/outstanding|Fee Due/i);
    expect(rows.map((r) => r.title)).toEqual(['Holiday']);
  });

  it('teacher: a manual row typed fee_due is also dropped', async () => {
    const { service } = makeCalendar({ manual: [{ title: 'X', type: 'fee_due', startDate: new Date('2026-10-10'), endDate: new Date('2026-10-10') }] });
    expect(await service.getEvents('s', range, { role: 'teacher' })).toHaveLength(0);
  });
});

describe('SchoolCalendarService.getEvents (exam label)', () => {
  const a = (grade: string, section?: string) => ({ _id: 'e1', title: 'T', type: 'unit_test', grade, section, startDate: new Date('2026-10-10'), endDate: null, campusId: null });
  it.each([
    ['Grade 5', 'A', 'unit test — Grade 5 A'],
    ['grade 5', undefined, 'unit test — grade 5'],
    ['5', 'B', 'unit test — Grade 5 B'],
  ])('grade %s section %s -> %s', async (grade, section, expected) => {
    const { service } = makeCalendar({ assessments: [a(grade, section)] });
    const rows: any[] = await service.getEvents('s', range, { role: 'admin' });
    expect(rows.find((r) => r.type === 'exam').description).toBe(expected);
  });
});
