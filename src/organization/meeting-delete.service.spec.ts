import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InstitutionSetupService } from './institution-setup.service';

// Unit tests for InstitutionSetupService.deleteMeeting's approved-minutes
// guard — same hand-rolled fake approach as meeting-minutes.service.spec.ts.

function makeMeetingDoc(overrides: any = {}) {
  return {
    _id: 'meeting1',
    schoolSlug: 'demo-school',
    title: 'Q3 Board Meeting',
    meetingMinutes: undefined,
    ...overrides,
  };
}

function makeService(meetingDoc: any) {
  const deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  const meetingModel: any = {
    findOne: jest.fn().mockImplementation((filter: any) => {
      const result = meetingDoc && meetingDoc._id === filter._id && meetingDoc.schoolSlug === filter.schoolSlug ? meetingDoc : null;
      return { lean: () => Promise.resolve(result ? { ...result } : null) };
    }),
    deleteOne,
  };
  const noop: any = {};
  const service = new InstitutionSetupService(
    noop, noop, meetingModel, noop, noop, noop, noop, noop, noop, noop,
  );
  return { service, meetingModel, deleteOne };
}

describe('InstitutionSetupService.deleteMeeting', () => {
  it('throws NotFoundException for an unknown meeting', async () => {
    const { service } = makeService(makeMeetingDoc());
    await expect(service.deleteMeeting('nope', 'demo-school')).rejects.toThrow(NotFoundException);
  });

  it('deletes a meeting with no minutes recorded', async () => {
    const { service, deleteOne } = makeService(makeMeetingDoc());
    const result = await service.deleteMeeting('meeting1', 'demo-school');
    expect(result).toEqual({ message: 'Meeting deleted' });
    expect(deleteOne).toHaveBeenCalledWith({ _id: 'meeting1', schoolSlug: 'demo-school' });
  });

  it('deletes a meeting whose minutes are still draft', async () => {
    const { service, deleteOne } = makeService(makeMeetingDoc({ meetingMinutes: { status: 'draft' } }));
    await expect(service.deleteMeeting('meeting1', 'demo-school')).resolves.toEqual({ message: 'Meeting deleted' });
    expect(deleteOne).toHaveBeenCalled();
  });

  it('deletes a meeting whose minutes are pending approval', async () => {
    const { service, deleteOne } = makeService(makeMeetingDoc({ meetingMinutes: { status: 'pending_approval' } }));
    await expect(service.deleteMeeting('meeting1', 'demo-school')).resolves.toEqual({ message: 'Meeting deleted' });
    expect(deleteOne).toHaveBeenCalled();
  });

  it('refuses to delete a meeting with approved minutes, and does not call deleteOne', async () => {
    const { service, deleteOne } = makeService(makeMeetingDoc({ meetingMinutes: { status: 'approved' } }));
    await expect(service.deleteMeeting('meeting1', 'demo-school')).rejects.toThrow(BadRequestException);
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
