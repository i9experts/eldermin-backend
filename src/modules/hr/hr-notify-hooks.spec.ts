import { Types } from 'mongoose';
import { HrService } from './hr.service';

// Unit tests for the leave-status notification hook in updateLeaveStatus.
// HrService has 42 injected deps before the optional notifier; unused ones
// are `{}`.

const TENANT = new Types.ObjectId().toString();
const APPROVER = new Types.ObjectId().toString();
const LEAVE_ID = new Types.ObjectId();
const APPLICANT_STAFF = new Types.ObjectId();
const APPLICANT_USER = new Types.ObjectId();

function make(opts: { notify?: jest.Mock | null; applicant?: any; slug?: string | null; updated?: any; approverStaff?: any } = {}) {
  const existing: any = {
    _id: LEAVE_ID, staffId: APPLICANT_STAFF, leaveType: 'casual', status: 'pending', totalDays: 2,
    fromDate: new Date('2026-10-10'), toDate: new Date('2026-10-11'),
  };
  const updated = 'updated' in opts ? opts.updated : { ...existing, status: 'x' };
  const leaveApplicationModel: any = {
    findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(existing) }),
    findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.resolve(updated) }),
  };
  const applicant = 'applicant' in opts ? opts.applicant : { userId: APPLICANT_USER };
  const staffModel: any = {
    db: { collection: () => ({ findOne: jest.fn().mockResolvedValue('slug' in opts ? (opts.slug ? { slug: opts.slug } : null) : { slug: 'demo' }) }) },
    findById: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(applicant) }) }),
    findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(opts.approverStaff ?? null) }) }),
  };
  const leaveBalanceModel: any = { updateOne: jest.fn().mockResolvedValue({}) };
  const args: any[] = Array.from({ length: 42 }, () => ({}));
  args[0] = staffModel;
  args[2] = leaveApplicationModel;
  args[7] = { deleteMany: jest.fn().mockResolvedValue({}) };
  args[8] = leaveBalanceModel;
  const notify = opts.notify === undefined ? jest.fn().mockResolvedValue(undefined) : opts.notify;
  args.push(notify ? { notify } : undefined);
  const service = new (HrService as any)(...args) as HrService;
  jest.spyOn(service as any, 'syncAttendanceForApprovedLeave').mockResolvedValue(undefined);
  return { service, notify, updated, leaveApplicationModel };
}

describe('HrService.updateLeaveStatus notify hook', () => {
  it.each(['approved', 'rejected'])('%s: notifies the applicant once with correct payload', async (status) => {
    const { service, notify, updated } = make();
    const r = await service.updateLeaveStatus(TENANT, String(LEAVE_ID), status, APPROVER, 'ok then');
    expect(r).toBe(updated);
    expect(notify).toHaveBeenCalledTimes(1);
    const arg = (notify as jest.Mock).mock.calls[0][0];
    expect(arg).toMatchObject({ recipientUserId: APPLICANT_USER, schoolSlug: 'demo', type: 'leave_status', relatedEntityId: String(LEAVE_ID) });
    expect(arg.title).toBe(`Leave request ${status}`);
    expect(arg.body).toContain('casual');
    expect(arg.body).toContain(`was ${status}`);
    expect(arg.body).toContain('ok then');
  });

  it('omits the Note suffix when no note is given', async () => {
    const { service, notify } = make();
    await service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'approved', APPROVER, '');
    expect((notify as jest.Mock).mock.calls[0][0].body).not.toContain('Note:');
  });

  it.each(['approved', 'rejected'])('%s: notifier throwing does not change the result', async (status) => {
    const { service, notify, updated } = make({ notify: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(service.updateLeaveStatus(TENANT, String(LEAVE_ID), status, APPROVER, 'n')).resolves.toBe(updated);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('no notify when slug or applicant userId cannot be resolved', async () => {
    const a = make({ slug: null });
    await expect(a.service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'approved', APPROVER, 'n')).resolves.toBe(a.updated);
    expect(a.notify).not.toHaveBeenCalled();
    const b = make({ applicant: { userId: null } });
    await b.service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'rejected', APPROVER, 'n');
    expect(b.notify).not.toHaveBeenCalled();
    const c = make({ applicant: null });
    await c.service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'rejected', APPROVER, 'n');
    expect(c.notify).not.toHaveBeenCalled();
  });

  it('no notify when the update returns no doc', async () => {
    const { service, notify } = make({ updated: null });
    await expect(service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'approved', APPROVER, 'n')).resolves.toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('no notify on invalid status or self-approval (action refused)', async () => {
    const a = make();
    await expect(a.service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'bogus', APPROVER, 'n')).rejects.toThrow();
    const b = make({ approverStaff: { _id: APPLICANT_STAFF } });
    await expect(b.service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'approved', APPROVER, 'n', 'hr_manager')).rejects.toThrow();
    expect(a.notify).not.toHaveBeenCalled();
    expect(b.notify).not.toHaveBeenCalled();
  });

  it('works without a notifier', async () => {
    const { service, updated } = make({ notify: null });
    await expect(service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'approved', APPROVER, 'n')).resolves.toBe(updated);
  });
});
