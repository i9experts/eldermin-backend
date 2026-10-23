import { Types } from 'mongoose';
import { HygieneService } from './hygiene.service';

const studentId = new Types.ObjectId();

describe('HygieneService', () => {
  it('bulkLog() upserts one record per student, defaulting unspecified items to compliant (true)', async () => {
    const findOneAndUpdate = jest.fn((_filter: any, _update: any, _opts: any) => ({ lean: () => Promise.resolve({}) }));
    const model: any = { findOneAndUpdate };
    const service = new HygieneService(model);

    const result = await service.bulkLog('demo-school', {
      records: [{
        studentId: String(studentId), studentName: 'Zara Ahmed', grade: '4', date: '2026-01-05',
        items: { uniform: false }, // capOrScarf/shoes/lunchBrought omitted
      }] as any,
    } as any, 'Ms. Hira');

    expect(result).toEqual({ logged: 1 });
    const update: any = findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.items).toEqual({
      uniform: false, capOrScarf: true, shoes: true, lunchBrought: true,
    });
  });
});
