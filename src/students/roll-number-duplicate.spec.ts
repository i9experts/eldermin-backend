import { ConflictException } from '@nestjs/common';
import { StudentsService } from './students.service';

// Pins the fix for "nothing stops two students in the same class from
// getting the same roll number" - no uniqueness check or index existed
// anywhere (Add Student, Student 360 edit, Admissions enrollment, CSV
// import could all freely save a colliding currentRollNumber). Covers the
// shared guard (assertRollNumberAvailable/getLastRollNumberInClass) from
// each of its call sites.

function matches(doc: any, filter: any): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '_id' && cond && typeof cond === 'object' && '$ne' in (cond as any)) {
      if (String(doc._id) === String((cond as any).$ne)) return false;
      continue;
    }
    if (cond instanceof RegExp) {
      if (!cond.test(String(doc[key] ?? ''))) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && !(cond instanceof RegExp)) continue; // other Mongo operators ($in/$regex) - skip, not needed on empty fixtures
    if (doc[key] !== cond) return false;
  }
  return true;
}

function makeFakeModel(seed: any[] = []) {
  const docs: any[] = seed.map((d) => ({ ...d }));

  class FakeModel {
    constructor(data: any) { Object.assign(this, { _id: `new-${docs.length}`, ...data }); }
    // Mirrors a real Mongoose document: fields live directly on the
    // instance (so `student.currentRollNumber` works after save, matching
    // createStudent's `return student;`), not nested under a `.data` prop.
    async save() { docs.push({ ...(this as any) }); return this; }

    static findOne = jest.fn((filter: any) => {
      const found = docs.find((d) => matches(d, filter)) || null;
      return {
        select: () => ({ lean: () => Promise.resolve(found) }),
        lean: () => Promise.resolve(found),
        then: (resolve: any, reject?: any) => Promise.resolve(found).then(resolve, reject),
      };
    });

    static find = jest.fn((filter: any) => {
      const found = docs.filter((d) => matches(d, filter));
      return {
        lean: () => Promise.resolve(found),
        select: () => ({ lean: () => Promise.resolve(found) }),
      };
    });

    static findOneAndUpdate = jest.fn((filter: any, update: any) => {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx === -1) return Promise.resolve(null);
      docs[idx] = { ...docs[idx], ...(update.$set || {}) };
      return Promise.resolve(docs[idx]);
    });

    static exists = jest.fn(async (filter: any) => (docs.some((d) => matches(d, filter)) ? { _id: 'x' } : null));

    static create = jest.fn(async (doc: any) => {
      const d = { _id: `new-${docs.length}`, ...doc };
      docs.push(d);
      return d;
    });

    static bulkWrite = jest.fn(async (ops: any[]) => {
      let modifiedCount = 0;
      for (const op of ops) {
        const { filter, update } = op.updateOne;
        const idx = docs.findIndex((d) => matches(d, filter));
        if (idx !== -1) { docs[idx] = { ...docs[idx], ...(update.$set || {}) }; modifiedCount++; }
      }
      return { modifiedCount };
    });
  }

  return { Model: FakeModel as any, docs };
}

function makeService(studentModel: any) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  return new StudentsService(studentModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

const existingInGrade5A = {
  _id: 'existing-1', schoolSlug: 's', status: 'active', currentGrade: 'Grade 5', currentSection: 'A',
  currentAcademicYear: '2025-26', currentRollNumber: '12', firstName: 'Ali', lastName: 'Khan',
};

describe('StudentsService roll-number duplicate guard', () => {
  describe('createStudent', () => {
    it('rejects a new student with a roll number already used in the same class', async () => {
      const { Model } = makeFakeModel([existingInGrade5A]);
      const svc = makeService(Model);
      await expect(svc.createStudent({
        schoolSlug: 's', firstName: 'Sara', lastName: 'Ahmed',
        currentGrade: 'Grade 5', currentSection: 'A', currentAcademicYear: '2025-26', currentRollNumber: '12',
      } as any)).rejects.toBeInstanceOf(ConflictException);
    });

    it('tells the admin the last roll number used in the class, as a next-number hint', async () => {
      const { Model } = makeFakeModel([existingInGrade5A]);
      const svc = makeService(Model);
      await expect(svc.createStudent({
        schoolSlug: 's', firstName: 'Sara', lastName: 'Ahmed',
        currentGrade: 'Grade 5', currentSection: 'A', currentAcademicYear: '2025-26', currentRollNumber: '12',
      } as any)).rejects.toThrow(/last roll number currently used in this class is 12/);
    });

    it('allows the same roll number in a different section (not a real collision)', async () => {
      const { Model } = makeFakeModel([existingInGrade5A]);
      const svc = makeService(Model);
      const result: any = await svc.createStudent({
        schoolSlug: 's', firstName: 'Sara', lastName: 'Ahmed',
        currentGrade: 'Grade 5', currentSection: 'B', currentAcademicYear: '2025-26', currentRollNumber: '12',
      } as any);
      expect(result.currentRollNumber).toBe('12');
    });

    it('allows creating a student with no roll number at all', async () => {
      const { Model } = makeFakeModel([existingInGrade5A]);
      const svc = makeService(Model);
      const result: any = await svc.createStudent({
        schoolSlug: 's', firstName: 'Sara', lastName: 'Ahmed', currentGrade: 'Grade 5', currentSection: 'A',
      } as any);
      expect(result.currentRollNumber).toBeUndefined();
    });
  });

  describe('updateStudent (Student 360 roll-number edit)', () => {
    it('rejects editing a roll number to one already used by another student in the same class', async () => {
      const { Model } = makeFakeModel([
        existingInGrade5A,
        { _id: 'editing-me', schoolSlug: 's', status: 'active', currentGrade: 'Grade 5', currentSection: 'A', currentAcademicYear: '2025-26', currentRollNumber: '5' },
      ]);
      const svc = makeService(Model);
      await expect(svc.updateStudent('editing-me', 's', { currentRollNumber: '12' } as any)).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows re-saving a student\'s own unchanged roll number (no false self-collision)', async () => {
      const { Model } = makeFakeModel([
        { _id: 'editing-me', schoolSlug: 's', status: 'active', currentGrade: 'Grade 5', currentSection: 'A', currentAcademicYear: '2025-26', currentRollNumber: '12' },
      ]);
      const svc = makeService(Model);
      const result: any = await svc.updateStudent('editing-me', 's', { currentRollNumber: '12' } as any);
      expect(result.currentRollNumber).toBe('12');
    });

    it('falls back to the student\'s own current grade/section when the edit only changes the roll number', async () => {
      const { Model } = makeFakeModel([
        existingInGrade5A,
        { _id: 'editing-me', schoolSlug: 's', status: 'active', currentGrade: 'Grade 5', currentSection: 'A', currentAcademicYear: '2025-26', currentRollNumber: '5' },
      ]);
      const svc = makeService(Model);
      // dto carries ONLY currentRollNumber, same shape Student 360's roll-number field sends
      await expect(svc.updateStudent('editing-me', 's', { currentRollNumber: '12' } as any)).rejects.toThrow(/already assigned to Ali Khan/);
    });
  });

  describe('getLastRollNumberInClass', () => {
    it('returns the highest numeric roll number currently used in the class', async () => {
      const { Model } = makeFakeModel([
        existingInGrade5A,
        { _id: 'e2', schoolSlug: 's', status: 'active', currentGrade: 'Grade 5', currentSection: 'A', currentAcademicYear: '2025-26', currentRollNumber: '20' },
        { _id: 'e3', schoolSlug: 's', status: 'active', currentGrade: 'Grade 5', currentSection: 'B', currentAcademicYear: '2025-26', currentRollNumber: '99' },
      ]);
      const svc = makeService(Model);
      const last = await svc.getLastRollNumberInClass('s', 'Grade 5', 'A', '2025-26');
      expect(last).toBe(20);
    });

    it('returns null for a class with no students yet', async () => {
      const { Model } = makeFakeModel([]);
      const svc = makeService(Model);
      expect(await svc.getLastRollNumberInClass('s', 'Grade 9', 'C', '2025-26')).toBeNull();
    });
  });

  describe('commitBulkImport', () => {
    it('rejects the second of two CSV rows claiming the same roll number in the same class', async () => {
      const { Model } = makeFakeModel([]);
      const svc = makeService(Model);
      const rows = [
        { row: 1, errors: [], data: { firstName: 'A', lastName: 'One', dateOfBirth: '2015-01-01', currentGrade: 'Grade 5', currentSection: 'A', currentRollNumber: '7' } },
        { row: 2, errors: [], data: { firstName: 'B', lastName: 'Two', dateOfBirth: '2015-02-02', currentGrade: 'Grade 5', currentSection: 'A', currentRollNumber: '7' } },
      ];
      const result = await svc.commitBulkImport('s', '2025-26', rows, 'skip');
      expect(result.created).toBe(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].row).toBe(2);
      expect(result.failed[0].error).toMatch(/already used/);
    });

    it('allows two rows with the same roll number in different sections', async () => {
      const { Model } = makeFakeModel([]);
      const svc = makeService(Model);
      const rows = [
        { row: 1, errors: [], data: { firstName: 'A', lastName: 'One', dateOfBirth: '2015-01-01', currentGrade: 'Grade 5', currentSection: 'A', currentRollNumber: '7' } },
        { row: 2, errors: [], data: { firstName: 'B', lastName: 'Two', dateOfBirth: '2015-02-02', currentGrade: 'Grade 5', currentSection: 'B', currentRollNumber: '7' } },
      ];
      const result = await svc.commitBulkImport('s', '2025-26', rows, 'skip');
      expect(result.created).toBe(2);
      expect(result.failed).toHaveLength(0);
    });

    it('rejects a CSV row colliding with an already-existing active student\'s roll number', async () => {
      const { Model } = makeFakeModel([existingInGrade5A]);
      const svc = makeService(Model);
      const rows = [
        { row: 1, errors: [], data: { firstName: 'New', lastName: 'Kid', dateOfBirth: '2015-01-01', currentGrade: 'Grade 5', currentSection: 'A', currentRollNumber: '12' } },
      ];
      const result = await svc.commitBulkImport('s', '2025-26', rows, 'skip');
      expect(result.created).toBe(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toMatch(/already used by Ali Khan/);
    });
  });
});
