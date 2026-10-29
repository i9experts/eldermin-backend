import 'reflect-metadata';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { CreateBehaviourDto } from './dto/student.dto';
import { BehaviourSchema } from './schemas/student-supporting.schema';

// Web Student Profile "Log Behaviour" (StudentProfile.tsx:2795-2806) sends NO studentName and NO category; it used to be 400 (DTO) and, with a category,
// a client-chosen studentName was stored as sent. R2.1: the name is derived from studentId (school-scoped), category defaults to 'general'.
const SID = new Types.ObjectId().toHexString();
const webBody = { studentId: SID, type: 'positive', description: 'Helped a friend', severity: 'low', points: 2, date: new Date().toISOString(), grade: 'Grade 5', section: 'A', schoolSlug: 'evil-slug', academicYear: '2026-27', reportedBy: 'Staff' };
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true });
const validate = (body: any) => pipe.transform(body, { type: 'body', metatype: CreateBehaviourDto });

function svc(student: any) {
  const saved: any[] = [];
  const behaviourModel: any = function (this: any, d: any) { Object.assign(this, d); this.save = async () => { saved.push({ ...d }); return this; }; };
  const studentModel: any = { findOne: jest.fn((f: any) => ({ select: () => ({ lean: async () => (student && f.schoolSlug === 'demo' ? student : null) }) })) };
  const s: any = Object.create(StudentsService.prototype);
  s.behaviourModel = behaviourModel; s.studentModel = studentModel;
  return { s: s as StudentsService, saved, studentModel };
}

describe('POST /students/behaviour with the web\'s exact body', () => {
  it('passes validation exactly as the global ValidationPipe applies it (no studentName, no category)', async () => {
    const dto: any = await validate({ ...webBody });
    expect(dto).toBeInstanceOf(CreateBehaviourDto);
    expect(dto.studentName).toBeUndefined();
    expect(dto.category).toBeUndefined();
  });
  it('a malformed body is still a 400 (bad studentId, bad type, missing description)', async () => {
    for (const bad of [{ ...webBody, studentId: 'x' }, { ...webBody, type: 'weird' }, { ...webBody, description: undefined }]) await expect(validate(bad)).rejects.toThrow();
  });
  it('creates the record in the legacy store with the name taken from the student and category "general"; the caller\'s school and the DB name win', async () => {
    const { s, saved, studentModel } = svc({ firstName: 'Sara', lastName: 'Sheikh' });
    const dto: any = await validate({ ...webBody });
    await s.createBehaviour({ ...dto, schoolSlug: 'demo', academicYear: '2026-27', reportedBy: 'Ms Teacher' });
    expect(studentModel.findOne).toHaveBeenCalledWith({ _id: SID, schoolSlug: 'demo' });
    expect(saved[0]).toMatchObject({ studentName: 'Sara Sheikh', category: 'general', schoolSlug: 'demo', type: 'positive', reportedBy: 'Ms Teacher' });
  });
  it('a client-supplied studentName is never trusted, a supplied category is kept', async () => {
    const { s, saved } = svc({ firstName: 'Sara', lastName: 'Sheikh' });
    const dto: any = await validate({ ...webBody, studentName: 'Somebody Else', category: 'achievement' });
    await s.createBehaviour({ ...dto, schoolSlug: 'demo', academicYear: 'y' });
    expect(saved[0]).toMatchObject({ studentName: 'Sara Sheikh', category: 'achievement' });
  });
  it('a student of another school (or an unknown id) is 404 and nothing is written', async () => {
    const { s, saved } = svc(null);
    await expect(s.createBehaviour({ ...(await validate({ ...webBody })), schoolSlug: 'demo', academicYear: 'y' } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(saved).toHaveLength(0);
  });
  it('the legacy schema accepts the web body\'s shape with category "general" (mongoose validation, no DB)', () => {
    const M = mongoose.model('WebLogBb12', BehaviourSchema);
    const doc = new M({ studentId: SID, studentName: 'Sara Sheikh', grade: 'Grade 5', date: new Date(), type: 'positive', category: 'general', description: 'x', schoolSlug: 'demo', academicYear: '2026-27' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.collection.name).toBe('student_behaviour');
  });
  it('the controller still refuses non-staff accounts before anything else (guard + assertStaffAccount unchanged) and passes the token\'s school', async () => {
    const createBehaviour = jest.fn(async (d: any) => d);
    const c: any = new StudentsController({ createBehaviour } as any, {} as any, { assertMayMark: async () => undefined } as any);
    await expect(c.createBehaviour(webBody, { headers: {}, user: { role: 'parent', schoolSlug: 'demo', name: 'P' } })).rejects.toThrow();
    expect(createBehaviour).not.toHaveBeenCalled();
    await c.createBehaviour(await validate({ ...webBody }), { headers: {}, user: { role: 'teacher', schoolSlug: 'demo', name: 'Ms T' } });
    expect(createBehaviour.mock.calls[0][0]).toMatchObject({ schoolSlug: 'demo', reportedBy: 'Ms T' });
  });
});
