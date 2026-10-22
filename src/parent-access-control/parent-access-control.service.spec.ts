import { Types } from 'mongoose';
import { ParentAccessControlService } from './parent-access-control.service';

const parentUserId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const adminUserId = new Types.ObjectId();

function lean(result: any) {
  const chain: any = { lean: () => Promise.resolve(result) };
  chain.select = () => chain;
  return chain;
}

describe('ParentAccessControlService', () => {
  describe('checkFeature', () => {
    it('never restricts a non-parent caller (e.g. staff/admin viewing the same screen)', async () => {
      const model: any = { findOne: jest.fn() };
      const studentModel: any = {};
      const service = new ParentAccessControlService(model, studentModel, {} as any);

      const result = await service.checkFeature('demo-school', { role: 'admin', userId: String(adminUserId) } as any, String(studentId), 'quiz');

      expect(result).toEqual({ suspended: false });
      expect(model.findOne).not.toHaveBeenCalled();
    });

    it('returns suspended: false when no record exists for the parent-student link', async () => {
      const model: any = { findOne: jest.fn(() => lean(null)) };
      const service = new ParentAccessControlService(model, {} as any, {} as any);

      const result = await service.checkFeature('demo-school', { role: 'parent', userId: String(parentUserId) } as any, String(studentId), 'quiz');

      expect(result).toEqual({ suspended: false });
    });

    it('returns suspended: true with the reason when that feature is suspended for this parent-student link', async () => {
      const model: any = {
        findOne: jest.fn(() => lean({
          features: { tarbiyah_report: { suspended: true, reason: 'Fee overdue 2 months' } },
        })),
      };
      const service = new ParentAccessControlService(model, {} as any, {} as any);

      const result = await service.checkFeature('demo-school', { role: 'parent', userId: String(parentUserId) } as any, String(studentId), 'tarbiyah_report');

      expect(result).toEqual({ suspended: true, reason: 'Fee overdue 2 months' });
    });

    it('does not leak a suspension on a different feature of the same parent-student link', async () => {
      const model: any = {
        findOne: jest.fn(() => lean({ features: { quiz: { suspended: true, reason: 'test' } } })),
      };
      const service = new ParentAccessControlService(model, {} as any, {} as any);

      const result = await service.checkFeature('demo-school', { role: 'parent', userId: String(parentUserId) } as any, String(studentId), 'academic_progress_report');

      expect(result).toEqual({ suspended: false });
    });
  });

  describe('setFeatureAccess / getAccess', () => {
    it('suspends the requested features, recording an audit history entry, and restoring clears the suspended flag', async () => {
      let stored: any = null;
      const model: any = {
        findOneAndUpdate: jest.fn((_filter: any, update: any) => {
          const current = stored || { features: {} };
          for (const [path, value] of Object.entries(update.$set || {})) {
            const [, feature, field] = path.split('.');
            current.features[feature] = current.features[feature] || {};
            current.features[feature][field] = value;
          }
          for (const [path, value] of Object.entries(update.$push || {})) {
            const [, feature] = path.split('.');
            current.features[feature].history = [...(current.features[feature].history || []), value];
          }
          stored = current;
          return lean(stored);
        }),
        findOne: jest.fn(() => lean(stored)),
      };
      const studentModel: any = { findOne: jest.fn(() => lean({ _id: studentId, firstName: 'Ali', lastName: 'Raza', currentGrade: '5', currentSection: 'A', campusId: null })) };
      const service = new ParentAccessControlService(model, studentModel, {} as any);
      const admin = { userId: String(adminUserId), name: 'Ms. Ayesha Khan' } as any;

      const afterSuspend = await service.setFeatureAccess('demo-school', String(parentUserId), String(studentId), {
        features: ['tarbiyah_report', 'academic_progress_report'], action: 'suspend', reason: 'Fee overdue',
      } as any, admin);

      expect(afterSuspend.features.tarbiyah_report.suspended).toBe(true);
      expect(afterSuspend.features.tarbiyah_report.reason).toBe('Fee overdue');
      expect(afterSuspend.features.academic_progress_report.suspended).toBe(true);
      expect(afterSuspend.features.quiz.suspended).toBe(false);
      expect(afterSuspend.features.tarbiyah_report.history).toHaveLength(1);
      expect(afterSuspend.features.tarbiyah_report.history[0]).toMatchObject({ action: 'suspended', reason: 'Fee overdue', byName: 'Ms. Ayesha Khan' });

      const afterRestore = await service.setFeatureAccess('demo-school', String(parentUserId), String(studentId), {
        features: ['tarbiyah_report'], action: 'restore',
      } as any, admin);

      expect(afterRestore.features.tarbiyah_report.suspended).toBe(false);
      expect(afterRestore.features.tarbiyah_report.history).toHaveLength(2);
      expect(afterRestore.features.tarbiyah_report.history[1]).toMatchObject({ action: 'restored' });
      // Untouched by the restore call - still suspended from the first call.
      expect(afterRestore.features.academic_progress_report.suspended).toBe(true);
    });
  });

  describe('listRestricted', () => {
    it('only returns parent-student links with at least one feature currently suspended', async () => {
      const model: any = {
        find: jest.fn(() => lean([
          { parentUserId, studentId, schoolSlug: 'demo-school', features: { quiz: { suspended: true } } },
          { parentUserId: new Types.ObjectId(), studentId: new Types.ObjectId(), schoolSlug: 'demo-school', features: { quiz: { suspended: false } } },
        ])),
      };
      const studentModel: any = { find: jest.fn(() => lean([{ _id: studentId, firstName: 'Ali', lastName: 'Raza' }])) };
      const service = new ParentAccessControlService(model, studentModel, {} as any);

      const result = await service.listRestricted('demo-school');

      expect(result).toHaveLength(1);
      expect(result[0].suspendedFeatures).toEqual(['quiz']);
    });
  });

  describe('listParentsForStudent', () => {
    it('resolves the parent (User) accounts linked to a student, for the admin UI to pick a parentUserId', async () => {
      const userModel: any = {
        find: jest.fn(() => lean([
          { _id: parentUserId, name: 'Mr. Bilal Ahmed', phone: '0300-0000000', email: null },
        ])),
      };
      const service = new ParentAccessControlService({} as any, {} as any, userModel);

      const result = await service.listParentsForStudent(String(studentId));

      expect(userModel.find).toHaveBeenCalledWith(expect.objectContaining({ primaryRole: 'parent', guardianOfStudentIds: String(studentId) }));
      expect(result).toEqual([
        { parentUserId: String(parentUserId), name: 'Mr. Bilal Ahmed', phone: '0300-0000000', email: null },
      ]);
    });

    it('falls back to the profile name when no name field is set', async () => {
      const userModel: any = {
        find: jest.fn(() => lean([
          { _id: parentUserId, profile: { firstName: 'Bilal', lastName: 'Ahmed' }, phone: null, email: null },
        ])),
      };
      const service = new ParentAccessControlService({} as any, {} as any, userModel);

      const result = await service.listParentsForStudent(String(studentId));

      expect(result[0].name).toBe('Bilal Ahmed');
    });
  });
});
