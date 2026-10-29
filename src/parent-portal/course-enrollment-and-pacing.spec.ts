// LMS Phase 1: ParentPortalService.getMyCourses must only show a 'manual'
// (elective) syllabus to a student with an active CourseEnrollment row,
// and must annotate locked lessons (future releaseDate, or an earlier
// lesson in a sequentialLessons topic not yet completed). Same indices as
// parent-feature-access-enforcement.spec.ts / parent-behaviour.spec.ts:
// studentModel 0, syllabusModel 24, lessonProgressModel 25, enrollmentModel 26.
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParentPortalService } from './parent-portal.service';

const MODEL_COUNT = 28;
const STUDENT_ID = new Types.ObjectId();
const AUTO_SYLLABUS_ID = new Types.ObjectId();
const MANUAL_SYLLABUS_ID = new Types.ObjectId();
const TENANT_ID = new Types.ObjectId().toString();
const USER = { role: 'parent', userId: 'p1', guardianOfStudentIds: [String(STUDENT_ID)] } as any;

function chain(result: any) {
  return { sort: () => chain(result), lean: () => Promise.resolve(result), distinct: () => Promise.resolve(result) };
}

function buildService(opts: {
  manualSyllabus?: any;
  autoSyllabus?: any;
  enrolledSyllabusIds?: Types.ObjectId[];
  progressRows?: any[];
}) {
  const stub = () => ({} as any);
  const models: any[] = Array.from({ length: MODEL_COUNT }, stub);

  const studentModel = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ currentGrade: 'Grade 5', currentSection: 'A' }) }) })) };
  models[0] = studentModel;

  const allSyllabi = [opts.autoSyllabus, opts.manualSyllabus].filter(Boolean);
  // Simulates just enough of the real `{ $or: [autoFilter, manualFilter] }`
  // matching getMyCourses builds, so this test exercises the service's
  // actual filter shape instead of a mock that ignores it entirely.
  const syllabusModel = {
    find: jest.fn((filter: any) => {
      const matches = allSyllabi.filter((s: any) => (filter.$or || []).some((cond: any) => {
        if (cond.enrollmentMode?.$ne === 'manual') return s.enrollmentMode !== 'manual';
        if (cond.enrollmentMode === 'manual') return s.enrollmentMode === 'manual' && (cond._id?.$in || []).some((id: any) => String(id) === String(s._id));
        return true;
      }));
      return { sort: () => ({ lean: () => Promise.resolve(matches) }) };
    }),
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(opts.manualSyllabus || opts.autoSyllabus) })),
  };
  models[24] = syllabusModel;

  const lessonProgressModel = {
    find: jest.fn(() => ({ lean: () => Promise.resolve(opts.progressRows || []) })),
    findOneAndUpdate: jest.fn(async (_f: any, u: any) => ({ ...u.$set })),
    countDocuments: jest.fn(async () => 0),
  };
  models[25] = lessonProgressModel;

  const enrollmentModel = {
    find: jest.fn(() => chain(opts.enrolledSyllabusIds || [])),
    exists: jest.fn(async () => (opts.enrolledSyllabusIds || []).length > 0),
  };
  models[26] = enrollmentModel;

  const services = [stub(), stub(), stub(), stub()]; // assessmentService, certificatesService, uploadService, pdfService
  const svc: any = new (ParentPortalService as any)(...models, ...services, {});
  return svc as ParentPortalService;
}

function makeSyllabus(overrides: any = {}) {
  return {
    _id: AUTO_SYLLABUS_ID, tenantId: TENANT_ID, subjectName: 'Math', teacherName: 'Mr X',
    academicYearLabel: '2026-27', term: 'Term 1', publishedToStudents: true, enrollmentMode: 'auto_by_class',
    units: [{
      unitNo: 1, unitName: 'Unit 1',
      topics: [{
        topicNo: 1, topicName: 'Topic 1', sequentialLessons: false,
        lessons: [{ lessonNo: 1, title: 'L1', order: 0 }, { lessonNo: 2, title: 'L2', order: 1 }],
      }],
    }],
    ...overrides,
  };
}

describe('LMS Phase 1 — course enrollment + pacing (ParentPortalService)', () => {
  it('a manual (elective) course with no enrollment never appears in getMyCourses', async () => {
    const manual = makeSyllabus({ _id: MANUAL_SYLLABUS_ID, enrollmentMode: 'manual' });
    const svc = buildService({ manualSyllabus: manual, enrolledSyllabusIds: [] });
    const result = await svc.getMyCourses(String(STUDENT_ID), USER, TENANT_ID, 'demo-school');
    expect(result).toEqual([]);
  });

  it('a manual (elective) course with an active enrollment appears in getMyCourses', async () => {
    const manual = makeSyllabus({ _id: MANUAL_SYLLABUS_ID, enrollmentMode: 'manual' });
    const svc = buildService({ manualSyllabus: manual, enrolledSyllabusIds: [MANUAL_SYLLABUS_ID] });
    const result = await svc.getMyCourses(String(STUDENT_ID), USER, TENANT_ID, 'demo-school');
    expect(result).toHaveLength(1);
    expect(String(result[0].syllabusId)).toBe(String(MANUAL_SYLLABUS_ID));
  });

  it('a lesson with a future releaseDate is reported locked', async () => {
    const auto = makeSyllabus({
      units: [{
        unitNo: 1, unitName: 'U1',
        topics: [{ topicNo: 1, topicName: 'T1', lessons: [{ lessonNo: 1, title: 'L1', order: 0, releaseDate: new Date('2099-01-01') }] }],
      }],
    });
    const svc = buildService({ autoSyllabus: auto });
    const result = await svc.getMyCourses(String(STUDENT_ID), USER, TENANT_ID, 'demo-school');
    expect(result[0].units[0].topics[0].lessons[0].locked).toBe(true);
  });

  it('a sequentialLessons topic locks lesson 2 until lesson 1 is completed', async () => {
    const auto = makeSyllabus({
      units: [{
        unitNo: 1, unitName: 'U1',
        topics: [{
          topicNo: 1, topicName: 'T1', sequentialLessons: true,
          lessons: [{ lessonNo: 1, title: 'L1', order: 0 }, { lessonNo: 2, title: 'L2', order: 1 }],
        }],
      }],
    });
    const svc = buildService({ autoSyllabus: auto, progressRows: [] });
    const result = await svc.getMyCourses(String(STUDENT_ID), USER, TENANT_ID, 'demo-school');
    const [l1, l2] = result[0].units[0].topics[0].lessons;
    expect(l1.locked).toBe(false);
    expect(l2.locked).toBe(true);
  });

  it('markLessonProgress rejects completing a locked lesson', async () => {
    const auto = makeSyllabus({
      units: [{
        unitNo: 1, unitName: 'U1',
        topics: [{
          topicNo: 1, topicName: 'T1', sequentialLessons: true,
          lessons: [{ lessonNo: 1, title: 'L1', order: 0 }, { lessonNo: 2, title: 'L2', order: 1 }],
        }],
      }],
    });
    const svc = buildService({ autoSyllabus: auto, progressRows: [] });
    await expect(svc.markLessonProgress(String(STUDENT_ID), USER, TENANT_ID, 'demo-school', {
      syllabusId: String(AUTO_SYLLABUS_ID), unitNo: 1, topicNo: 1, lessonNo: 2, status: 'completed',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('markLessonProgress on a manual course the student is not enrolled in 404s', async () => {
    const manual = makeSyllabus({ _id: MANUAL_SYLLABUS_ID, enrollmentMode: 'manual' });
    const svc = buildService({ autoSyllabus: manual, enrolledSyllabusIds: [] });
    await expect(svc.markLessonProgress(String(STUDENT_ID), USER, TENANT_ID, 'demo-school', {
      syllabusId: String(MANUAL_SYLLABUS_ID), unitNo: 1, topicNo: 1, lessonNo: 1, status: 'completed',
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});
