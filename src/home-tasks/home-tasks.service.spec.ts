import { Types } from 'mongoose';
import { HomeTasksService } from './home-tasks.service';

function chain(result: any) {
  const obj: any = {};
  ['select', 'sort', 'limit'].forEach((m) => { obj[m] = () => obj; });
  obj.lean = () => Promise.resolve(result);
  return obj;
}

const studentId = new Types.ObjectId();
const teacherId = new Types.ObjectId();

const notSuspended: any = { checkFeature: jest.fn(() => Promise.resolve({ suspended: false })) };

describe('HomeTasksService', () => {
  it('assign() creates one home task per resolved student, denormalizing name/grade/section', async () => {
    const insertMany = jest.fn((docs: any[]) => Promise.resolve(docs));
    const model: any = {
      insertMany,
      findOneAndUpdate: jest.fn(() => chain(null)),
    };
    const studentModel: any = {
      find: jest.fn(() => chain([
        { _id: studentId, firstName: 'Ali', lastName: 'Raza', currentGrade: '3', currentSection: 'B', campusId: null },
      ])),
    };
    const service = new HomeTasksService(model, studentModel, notSuspended);

    const result = await service.assign('demo-school', {
      studentIds: [String(studentId)], title: 'Practice Sidq at home',
      assignedDate: '2026-01-01',
    } as any, 'Ms. Fatima', String(teacherId));

    expect(result).toEqual({ assigned: 1 });
    expect(insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        studentId, studentName: 'Ali Raza', grade: '3', section: 'B',
        title: 'Practice Sidq at home', status: 'assigned', schoolSlug: 'demo-school',
      }),
    ]);
  });

  it('completeTask() throws NotFoundException when the task does not belong to that student/school', async () => {
    const model: any = {
      findOneAndUpdate: jest.fn(() => Promise.resolve(null)),
    };
    const studentModel: any = { find: jest.fn(() => chain([])) };
    const service = new HomeTasksService(model, studentModel, notSuspended);

    await expect(
      service.completeTask(String(studentId), 'bad-task-id', { guardianOfStudentIds: [String(studentId)] } as any, 'demo-school', {}),
    ).rejects.toThrow('Home task not found');
  });
});
