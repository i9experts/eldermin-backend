import { ParentPortalService } from './parent-portal.service';

// Pins the Institution Overview dashboard's Academics widget pending-count:
// the only other StudentLeave access (getStudentLeaves) is scoped to one
// student; this is the first school-wide aggregate over it.

describe('ParentPortalService.getPendingStudentLeaveCount', () => {
  it('counts only this school\'s pending leave requests', async () => {
    const countDocuments = jest.fn(async (filter: any) => (filter.schoolSlug === 'demo-school' && filter.status === 'pending' ? 3 : 0));
    const svc: any = Object.create(ParentPortalService.prototype);
    svc.studentLeaveModel = { countDocuments };

    const result = await svc.getPendingStudentLeaveCount('demo-school');

    expect(result).toEqual({ pending: 3 });
    expect(countDocuments).toHaveBeenCalledWith({ schoolSlug: 'demo-school', status: 'pending' });
  });
});
