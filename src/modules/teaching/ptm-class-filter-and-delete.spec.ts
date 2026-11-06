import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PTMService } from './ptm.service';

const oid = () => new Types.ObjectId().toString();
const chain = (v: any) => { const c: any = { select: () => c, sort: () => ({ ...c, limit: () => c }), limit: () => c, lean: () => Promise.resolve(v) }; return c; };

function make() {
  const PtmModel: any = {
    find: jest.fn(() => chain([])),
    findOneAndDelete: jest.fn(),
  };
  const studentModel: any = {};
  const staffModel: any = { db: { collection: () => ({ findOne: async () => null }) } };
  const emailService: any = {};
  const service = new PTMService(PtmModel, studentModel, staffModel, emailService, undefined, undefined);
  return { service, PtmModel };
}

const admin = { role: 'admin', userId: oid(), campusId: oid() };

describe('PTM list - class-wise (grade/section) filter', () => {
  // gradeLevel/sectionName are denormalized onto every PTMMeeting at
  // creation time from the student's currentGrade/currentSection (see
  // createMeeting), so a "view meetings for this class" selector in the
  // PTM tab can filter directly on the meeting list without joining back
  // to Students for every row.
  it('filters by grade alone', async () => {
    const m = make();
    await m.service.getMeetings('t', { grade: 'Grade 1' }, admin as any);
    const filter = m.PtmModel.find.mock.calls[0][0];
    expect(filter.gradeLevel).toBe('Grade 1');
    expect(filter.sectionName).toBeUndefined();
  });

  it('filters by grade + section together', async () => {
    const m = make();
    await m.service.getMeetings('t', { grade: 'Grade 1', section: 'A' }, admin as any);
    const filter = m.PtmModel.find.mock.calls[0][0];
    expect(filter.gradeLevel).toBe('Grade 1');
    expect(filter.sectionName).toBe('A');
  });

  it('omits the class filter entirely when neither is given (unchanged behaviour)', async () => {
    const m = make();
    await m.service.getMeetings('t', {}, admin as any);
    const filter = m.PtmModel.find.mock.calls[0][0];
    expect(filter.gradeLevel).toBeUndefined();
    expect(filter.sectionName).toBeUndefined();
  });
});

describe('PTM admin delete (fixing a mistakenly scheduled meeting)', () => {
  it('deletes the meeting when found in this tenant', async () => {
    const m = make();
    const id = oid();
    m.PtmModel.findOneAndDelete.mockResolvedValue({ _id: id });
    const result = await m.service.deleteMeeting(id, 'tenantA');
    expect(m.PtmModel.findOneAndDelete).toHaveBeenCalledWith({ _id: id, tenantId: 'tenantA' });
    expect(result).toEqual({ deleted: true });
  });

  it('throws NotFoundException when the meeting does not exist (or belongs to another tenant)', async () => {
    const m = make();
    m.PtmModel.findOneAndDelete.mockResolvedValue(null);
    await expect(m.service.deleteMeeting(oid(), 'tenantA')).rejects.toThrow(NotFoundException);
  });

  it('rejects an invalid meeting id before ever touching the database', async () => {
    const m = make();
    await expect(m.service.deleteMeeting('not-an-id', 'tenantA')).rejects.toThrow('Invalid meeting id');
    expect(m.PtmModel.findOneAndDelete).not.toHaveBeenCalled();
  });
});
