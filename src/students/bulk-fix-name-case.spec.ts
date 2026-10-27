import { StudentsService } from './students.service';

// Fast path for normalizing First/Last Name casing for a batch of
// students at once (e.g. fixing a cohort entered in ALL CAPS via a CSV
// import) instead of editing Student 360 one child at a time.

function makeService(studentModel: any) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  return new StudentsService(studentModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

describe('StudentsService.bulkFixNameCase', () => {
  it('applies Title Case to firstName only, leaving lastName untouched', async () => {
    const students = [{ _id: 'a', firstName: 'MUHAMMAD', lastName: 'ALI KHAN' }];
    const studentModel: any = {
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(students) }) })),
      bulkWrite: jest.fn(async (ops: any[]) => ({ modifiedCount: ops.length })),
    };
    const svc = makeService(studentModel);

    const result = await svc.bulkFixNameCase('s', ['a'], 'title');

    expect(studentModel.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: 'a' }, update: { $set: { firstName: 'Muhammad' } } } },
    ]);
    expect(result).toEqual({ matched: 1, updated: 1 });
  });

  it('applies different styles to firstName and lastName in the same call', async () => {
    const students = [{ _id: 'a', firstName: 'ayesha', lastName: 'siddiqua' }];
    const studentModel: any = {
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(students) }) })),
      bulkWrite: jest.fn(async (ops: any[]) => ({ modifiedCount: ops.length })),
    };
    const svc = makeService(studentModel);

    await svc.bulkFixNameCase('s', ['a'], 'title', 'upper');

    expect(studentModel.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: 'a' }, update: { $set: { firstName: 'Ayesha', lastName: 'SIDDIQUA' } } } },
    ]);
  });

  it('handles hyphenated and apostrophe names correctly in Title Case', async () => {
    const students = [{ _id: 'a', firstName: 'ALI-RAZA', lastName: "O'BRIEN" }];
    const studentModel: any = {
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(students) }) })),
      bulkWrite: jest.fn(async (ops: any[]) => ({ modifiedCount: ops.length })),
    };
    const svc = makeService(studentModel);

    await svc.bulkFixNameCase('s', ['a'], 'title', 'title');

    expect(studentModel.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: 'a' }, update: { $set: { firstName: 'Ali-Raza', lastName: "O'Brien" } } } },
    ]);
  });

  it('skips students whose name already matches the target case (no-op update)', async () => {
    const students = [{ _id: 'a', firstName: 'Muhammad', lastName: 'Ali' }];
    const studentModel: any = {
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(students) }) })),
      bulkWrite: jest.fn(),
    };
    const svc = makeService(studentModel);

    const result = await svc.bulkFixNameCase('s', ['a'], 'title', 'title');

    expect(studentModel.bulkWrite).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: 1, updated: 0 });
  });

  it('rejects when neither firstNameCase nor lastNameCase is given', async () => {
    const svc = makeService({ find: jest.fn(), bulkWrite: jest.fn() });
    await expect(svc.bulkFixNameCase('s', ['a'])).rejects.toThrow(/Pick a case style/);
  });

  it('rejects an invalid case style', async () => {
    const svc = makeService({ find: jest.fn(), bulkWrite: jest.fn() });
    await expect(svc.bulkFixNameCase('s', ['a'], 'lowercase')).rejects.toThrow(/Invalid case style/);
  });

  it('rejects an empty studentIds list', async () => {
    const svc = makeService({ find: jest.fn(), bulkWrite: jest.fn() });
    await expect(svc.bulkFixNameCase('s', [], 'title')).rejects.toThrow(/studentIds is required/);
  });
});
