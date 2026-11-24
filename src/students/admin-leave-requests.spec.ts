import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StudentsService } from './students.service';

// Covers the new Admin Leave Requests tab: a school admin (any
// TEACHING_ADMIN_ROLES caller) reviewing a parent-submitted StudentLeave
// regardless of class-teacher assignment, distinct from the
// class-teacher-only review in staff-portal.service.ts.

function makeStudentLeaveModel(seed: any[]) {
  const docs: any[] = seed.map((d) => ({ ...d, save: undefined, toObject: undefined }));
  docs.forEach((d) => {
    d.save = jest.fn(async function (this: any) { return this; });
    d.toObject = function (this: any) { const { save, toObject, ...rest } = this; return rest; };
  });
  return {
    find: jest.fn((filter: any) => ({
      sort: () => ({
        limit: () => ({
          lean: async () => docs.filter((d) => d.schoolSlug === filter.schoolSlug && (!filter.status || d.status === filter.status)),
        }),
      }),
    })),
    findOne: jest.fn(async (filter: any) => docs.find((d) => String(d._id) === String(filter._id) && d.schoolSlug === filter.schoolSlug) || null),
  };
}

function makeNotificationModel() {
  return { create: jest.fn(async () => ({})) };
}

function makeService(studentLeaveModel: any, notificationModel: any) {
  const n: any = undefined;
  return new StudentsService(
    n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, // 23 params: studentModel..uploadService
    n, // behaviourRecordModel
    n, // enrollmentModel
    studentLeaveModel,
    notificationModel,
  );
}

describe('StudentsService admin leave requests', () => {
  const pending = {
    _id: new Types.ObjectId().toString(), schoolSlug: 's1', status: 'pending',
    studentName: 'Muhammad Abdullah', requestedByUserId: 'parent-1',
  };

  it('listLeaveRequests returns pending leaves for the school, not scoped to any class teacher', async () => {
    const studentLeaveModel = makeStudentLeaveModel([pending]);
    const svc = makeService(studentLeaveModel, makeNotificationModel());
    const res = await svc.listLeaveRequests('s1', { status: 'pending', limit: '50' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].studentName).toBe('Muhammad Abdullah');
  });

  it('reviewLeaveRequest lets an admin approve a leave even though they are not the class teacher', async () => {
    const studentLeaveModel = makeStudentLeaveModel([pending]);
    const notificationModel = makeNotificationModel();
    const svc = makeService(studentLeaveModel, notificationModel);
    const result = await svc.reviewLeaveRequest('s1', pending._id, { status: 'approved', remarks: 'Get well soon' }, { name: 'Principal Jane' });
    expect(result.status).toBe('approved');
    expect(result.approverName).toBe('Principal Jane');
    expect(result.approverNote).toBe('Get well soon');
    expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_decision', recipientUserId: 'parent-1' }));
  });

  it('rejects reviewing an already-decided leave', async () => {
    const studentLeaveModel = makeStudentLeaveModel([{ ...pending, status: 'approved' }]);
    const svc = makeService(studentLeaveModel, makeNotificationModel());
    await expect(svc.reviewLeaveRequest('s1', pending._id, { status: 'rejected' }, { name: 'Admin' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown leave id', async () => {
    const studentLeaveModel = makeStudentLeaveModel([]);
    const svc = makeService(studentLeaveModel, makeNotificationModel());
    await expect(svc.reviewLeaveRequest('s1', new Types.ObjectId().toString(), { status: 'approved' }, { name: 'Admin' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('a leave from another school is not visible or reviewable', async () => {
    const studentLeaveModel = makeStudentLeaveModel([{ ...pending, schoolSlug: 'other-school' }]);
    const svc = makeService(studentLeaveModel, makeNotificationModel());
    const res = await svc.listLeaveRequests('s1', {});
    expect(res.items).toHaveLength(0);
    await expect(svc.reviewLeaveRequest('s1', pending._id, { status: 'approved' }, { name: 'Admin' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
