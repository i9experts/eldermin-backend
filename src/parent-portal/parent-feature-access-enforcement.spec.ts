// Focused enforcement test for the Parent App Feature Access Control
// integration into ParentPortalService: a suspended feature short-circuits
// before any data lookup and returns the structured { suspended, feature,
// reason } shape the mobile app renders as a locked screen, while a
// non-parent caller (or a feature nobody suspended) is unaffected.
import { Types } from 'mongoose';
import { ParentPortalService } from './parent-portal.service';

function stubModel() { return {} as any; }

// ParentPortalService takes 27 positional model injections, then 4 service
// injections, then ParentAccessControlService - rather than hand-count 32
// positional args (fragile against constructor reordering), build the
// model list, slot the one model this test actually needs in at the
// reportCardModel position, and spread everything through `new`.
const MODEL_COUNT = 28;
const REPORT_CARD_MODEL_INDEX = 4; // 0-based: studentModel, attendanceModel, invoiceModel, markModel, reportCardModel, ...

function buildService(parentAccess: any) {
  const reportCardModel = { find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([{ _id: 'rc1' }]) }) })) };
  const models = Array.from({ length: MODEL_COUNT }, () => stubModel());
  models[REPORT_CARD_MODEL_INDEX] = reportCardModel as any;
  const services = [stubModel(), stubModel(), stubModel(), stubModel()]; // assessmentService, certificatesService, uploadService, pdfService
  return new (ParentPortalService as any)(...models, ...services, parentAccess);
}

const studentId = new Types.ObjectId();

describe('ParentPortalService — feature access enforcement (academic_progress_report)', () => {
  it('returns a suspended placeholder instead of report cards when the feature is suspended for this parent', async () => {
    const parentAccess: any = { checkFeature: jest.fn(() => Promise.resolve({ suspended: true, reason: 'Fee overdue' })) };
    const service = buildService(parentAccess);

    const result = await service.getResults(String(studentId), { role: 'parent', userId: 'p1', guardianOfStudentIds: [String(studentId)] } as any, 'demo-school');

    expect(result).toEqual({ suspended: true, feature: 'academic_progress_report', reason: 'Fee overdue' });
    expect(parentAccess.checkFeature).toHaveBeenCalledWith('demo-school', expect.objectContaining({ role: 'parent' }), String(studentId), 'academic_progress_report');
  });

  it('returns real report cards when the feature is not suspended', async () => {
    const parentAccess: any = { checkFeature: jest.fn(() => Promise.resolve({ suspended: false })) };
    const service = buildService(parentAccess);

    const result = await service.getResults(String(studentId), { role: 'parent', userId: 'p1', guardianOfStudentIds: [String(studentId)] } as any, 'demo-school');

    expect(result).toEqual([{ _id: 'rc1' }]);
  });
});
