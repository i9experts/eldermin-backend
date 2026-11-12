import { GuidedReadingService, READER_COMPLETION_POINTS } from './guided-reading.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

// Guided Reading Phase 1: ReadingLevel/Reader CRUD + student level
// assignment. No real Mongo - each test wires in just the model methods
// the code under test actually calls, same convention as
// grading-scale-and-visibility.spec.ts.

function makeService(overrides: Record<string, any> = {}) {
  const svc: any = Object.create(GuidedReadingService.prototype);
  svc.levelModel = overrides.levelModel;
  svc.readerModel = overrides.readerModel;
  svc.progressModel = overrides.progressModel;
  return svc;
}

describe('GuidedReadingService — Reading Levels', () => {
  it('createLevel scopes the new level to the caller\'s school', async () => {
    const levelModel: any = { create: jest.fn(async (dto: any) => ({ _id: 'l1', ...dto })) };
    const svc = makeService({ levelModel });
    const result = await svc.createLevel('school-a', { name: 'Level 1', order: 1 });
    expect(result.schoolSlug).toBe('school-a');
    expect(levelModel.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Level 1', schoolSlug: 'school-a' }));
  });

  it('updateLevel 404s for a level in a different school or that does not exist', async () => {
    const levelModel: any = { findOne: async () => null };
    const svc = makeService({ levelModel });
    await expect(svc.updateLevel('507f1f77bcf86cd799439011', 'school-a', { name: 'New' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('removeLevel refuses to delete a level that still has readers assigned', async () => {
    const levelModel: any = { findOneAndDelete: jest.fn() };
    const readerModel: any = { exists: async () => true };
    const svc = makeService({ levelModel, readerModel });
    await expect(svc.removeLevel('507f1f77bcf86cd799439011', 'school-a'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(levelModel.findOneAndDelete).not.toHaveBeenCalled();
  });

  it('removeLevel 404s when nothing was deleted', async () => {
    const levelModel: any = { findOneAndDelete: async () => null };
    const readerModel: any = { exists: async () => false };
    const svc = makeService({ levelModel, readerModel });
    await expect(svc.removeLevel('507f1f77bcf86cd799439011', 'school-a'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GuidedReadingService — Readers', () => {
  it('createReader rejects a level that does not exist for this school', async () => {
    const levelModel: any = { exists: async () => false };
    const readerModel: any = { create: jest.fn() };
    const svc = makeService({ levelModel, readerModel });
    await expect(svc.createReader('school-a', { levelId: '507f1f77bcf86cd799439011', title: 'Book' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(readerModel.create).not.toHaveBeenCalled();
  });

  it('createReader creates the reader with its keywords and pages when the level exists', async () => {
    const levelModel: any = { exists: async () => true };
    const readerModel: any = { create: jest.fn(async (dto: any) => ({ _id: 'r1', ...dto })) };
    const svc = makeService({ levelModel, readerModel });
    const dto = {
      levelId: '507f1f77bcf86cd799439011',
      title: 'The Big Apple',
      keywords: [{ word: 'apple', meaning: 'a round fruit' }],
      pages: [{ pageNumber: 1, text: 'This is an apple.' }],
    };
    const result = await svc.createReader('school-a', dto);
    expect(result.schoolSlug).toBe('school-a');
    expect(result.keywords[0].word).toBe('apple');
  });

  it('listReaders filters by levelId when provided', async () => {
    const find = jest.fn(() => ({ sort: () => ({ lean: async () => [] }) }));
    const readerModel: any = { find };
    const svc = makeService({ readerModel });
    await svc.listReaders('school-a', 'level-1');
    expect(find).toHaveBeenCalledWith({ schoolSlug: 'school-a', levelId: 'level-1' });
  });

  it('findReaderById 404s when the reader does not exist in this school', async () => {
    const readerModel: any = { findOne: () => ({ lean: async () => null }) };
    const svc = makeService({ readerModel });
    await expect(svc.findReaderById('507f1f77bcf86cd799439011', 'school-a'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GuidedReadingService — Student assignment / progress', () => {
  it('assignStudentLevel rejects a level that does not exist for this school', async () => {
    const levelModel: any = { exists: async () => false };
    const progressModel: any = { findOneAndUpdate: jest.fn() };
    const svc = makeService({ levelModel, progressModel });
    await expect(svc.assignStudentLevel('student-1', 'school-a', 'bad-level', 'teacher-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(progressModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('assignStudentLevel upserts the student\'s progress row with the new level', async () => {
    const levelModel: any = { exists: async () => true };
    const findOneAndUpdate = jest.fn(() => ({ lean: async () => ({ studentId: 'student-1', currentLevelId: 'level-1' }) }));
    const progressModel: any = { findOneAndUpdate };
    const svc = makeService({ levelModel, progressModel });
    const result = await svc.assignStudentLevel('student-1', 'school-a', 'level-1', 'teacher-1');
    expect(result.currentLevelId).toBe('level-1');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { studentId: 'student-1', schoolSlug: 'school-a' },
      expect.objectContaining({ $set: expect.objectContaining({ currentLevelId: 'level-1', assignedBy: 'teacher-1' }) }),
      expect.objectContaining({ upsert: true, new: true }),
    );
  });

  it('getStudentProgress returns a default empty shape when no record exists yet', async () => {
    const progressModel: any = { findOne: () => ({ lean: async () => null }) };
    const svc = makeService({ progressModel });
    const result = await svc.getStudentProgress('student-1', 'school-a');
    expect(result.completedReaders).toEqual([]);
    expect(result.currentLevelId).toBeNull();
  });
});

describe('GuidedReadingService — Student reading player (Phase 3)', () => {
  it('getReadingHome returns an empty shelf when no level is assigned yet', async () => {
    const progressModel: any = { findOne: () => ({ lean: async () => null }) };
    const svc = makeService({ progressModel });
    const result = await svc.getReadingHome('student-1', 'school-a');
    expect(result).toEqual({ level: null, readers: [], completedCount: 0 });
  });

  it('getReadingHome lists only readers at the assigned level, flagging completed ones', async () => {
    const progressModel: any = {
      findOne: () => ({
        lean: async () => ({
          studentId: 'student-1', currentLevelId: 'level-1',
          completedReaders: [{ readerId: 'reader-1', completedAt: new Date(), keywordsLookedUp: [], pointsAwarded: 15 }],
        }),
      }),
    };
    const levelModel: any = { findOne: () => ({ lean: async () => ({ _id: 'level-1', name: 'Level 1' }) }) };
    const readers = [
      { _id: 'reader-1', title: 'Book One', pages: [{}, {}], keywords: [{}], audioUrl: 'a.mp3' },
      { _id: 'reader-2', title: 'Book Two', pages: [{}], keywords: [], audioUrl: undefined },
    ];
    const readerModel: any = { find: () => ({ select: () => ({ sort: () => ({ lean: async () => readers }) }) }) };
    const svc = makeService({ progressModel, levelModel, readerModel });
    const result = await svc.getReadingHome('student-1', 'school-a');
    expect(result.level.name).toBe('Level 1');
    expect(result.completedCount).toBe(1);
    expect(result.readers.find((r: any) => r._id === 'reader-1').isCompleted).toBe(true);
    expect(result.readers.find((r: any) => r._id === 'reader-2').isCompleted).toBe(false);
    expect(result.readers.find((r: any) => r._id === 'reader-2').pageCount).toBe(1);
  });

  it('getReaderForStudent refuses a reader outside the student\'s assigned level', async () => {
    const readerModel: any = { findOne: () => ({ lean: async () => ({ _id: 'reader-9', levelId: 'level-2' }) }) };
    const progressModel: any = { findOne: () => ({ lean: async () => ({ currentLevelId: 'level-1', completedReaders: [] }) }) };
    const svc = makeService({ readerModel, progressModel });
    await expect(svc.getReaderForStudent('reader-9', 'student-1', 'school-a')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getReaderForStudent allows re-reading an already-completed reader even after the level moved on', async () => {
    const readerModel: any = { findOne: () => ({ lean: async () => ({ _id: 'reader-1', levelId: 'level-1', title: 'Book One' }) }) };
    const progressModel: any = {
      findOne: () => ({ lean: async () => ({ currentLevelId: 'level-2', completedReaders: [{ readerId: 'reader-1' }] }) }),
    };
    const svc = makeService({ readerModel, progressModel });
    const result = await svc.getReaderForStudent('reader-1', 'student-1', 'school-a');
    expect(result.isCompleted).toBe(true);
  });

  it('completeReaderForStudent refuses a reader outside the assigned level', async () => {
    const readerModel: any = { findOne: jest.fn(async () => ({ _id: 'reader-9', levelId: 'level-2' })) };
    const progressModel: any = { findOne: async () => ({ currentLevelId: 'level-1', completedReaders: [] }) };
    const svc = makeService({ readerModel, progressModel });
    await expect(svc.completeReaderForStudent('reader-9', 'student-1', 'school-a')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('completeReaderForStudent is idempotent - re-completing an already-finished reader awards nothing new', async () => {
    const readerModel: any = { findOne: jest.fn(async () => ({ _id: 'reader-1', levelId: 'level-1' })) };
    const progressModel: any = {
      findOne: async () => ({ currentLevelId: 'level-1', completedReaders: [{ readerId: 'reader-1' }] }),
      findOneAndUpdate: jest.fn(),
    };
    const svc = makeService({ readerModel, progressModel });
    const result = await svc.completeReaderForStudent('reader-1', 'student-1', 'school-a');
    expect(result.justCompleted).toBe(false);
    expect(progressModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('completeReaderForStudent records the first completion with its keywords and point value', async () => {
    const readerModel: any = { findOne: jest.fn(async () => ({ _id: 'reader-1', levelId: 'level-1', title: 'Book One' })) };
    const progressModel: any = {
      findOne: async () => ({ currentLevelId: 'level-1', completedReaders: [] }),
      findOneAndUpdate: jest.fn(async (_filter: any, update: any) => ({
        completedReaders: [update.$push.completedReaders],
      })),
    };
    const svc = makeService({ readerModel, progressModel });
    const result = await svc.completeReaderForStudent('reader-1', 'student-1', 'school-a', ['apple', 'big']);
    expect(result.justCompleted).toBe(true);
    expect(result.completedCount).toBe(1);
    expect(progressModel.findOneAndUpdate).toHaveBeenCalledWith(
      { studentId: 'student-1', schoolSlug: 'school-a' },
      expect.objectContaining({
        $push: { completedReaders: expect.objectContaining({ keywordsLookedUp: ['apple', 'big'], pointsAwarded: READER_COMPLETION_POINTS }) },
      }),
      expect.objectContaining({ new: true }),
    );
  });
});
