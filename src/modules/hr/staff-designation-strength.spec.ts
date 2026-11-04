import { HrService } from './hr.service';

// Pins HrService.getStaffDesignationStrength, built for the Institution
// Overview dashboard's "Staff by Designation Strength" widget - no existing
// HR aggregation grouped active staff by designation with a gender split.

function makeService(staffModel: any) {
  const svc: any = Object.create(HrService.prototype);
  svc.staffModel = staffModel;
  return svc;
}

describe('HrService.getStaffDesignationStrength', () => {
  it('groups active staff by designation with a male/female/other split and school-wide totals', async () => {
    const staffModel: any = {
      aggregate: async () => [
        { _id: 'Teacher', total: 10, male: 4, female: 6, other: 0 },
        { _id: 'Principal', total: 1, male: 1, female: 0, other: 0 },
        { _id: 'Unspecified', total: 2, male: 1, female: 0, other: 1 },
      ],
    };
    const svc = makeService(staffModel);

    const result = await svc.getStaffDesignationStrength('demo-school');

    expect(result.totals).toEqual({ total: 13, male: 6, female: 6, other: 1 });
    expect(result.designations).toEqual([
      { designation: 'Teacher', total: 10, male: 4, female: 6, other: 0 },
      { designation: 'Principal', total: 1, male: 1, female: 0, other: 0 },
      { designation: 'Unspecified', total: 2, male: 1, female: 0, other: 1 },
    ]);
  });

  it('returns zeroed totals and an empty list when there is no active staff yet', async () => {
    const staffModel: any = { aggregate: async () => [] };
    const svc = makeService(staffModel);

    const result = await svc.getStaffDesignationStrength('demo-school');

    expect(result.totals).toEqual({ total: 0, male: 0, female: 0, other: 0 });
    expect(result.designations).toEqual([]);
  });
});
