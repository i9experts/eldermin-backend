import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { makeAssessmentService, oid, teacherUser } from './assessment-test-fakes';

const cardId = oid().toString();
const card = { _id: cardId, grade: 'Grade 5', section: 'A' };
const classTeacher = { isClassTeacher: true, classTeacherOfGradeName: '5', classTeacherOfSectionName: 'a', currentAssignments: [] };

describe('report-card remarks: teacher', () => {
  it('class teacher of the card class can write classTeacherRemarks (tolerant grade/section match)', async () => {
    const { service, reportCardModel } = makeAssessmentService({ profile: classTeacher, reportCard: card });
    await service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'Good' }, teacherUser());
    expect(reportCardModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { classTeacherRemarks: 'Good' } });
  });
  it('principalRemarks is stripped', async () => {
    const { service, reportCardModel } = makeAssessmentService({ profile: classTeacher, reportCard: card });
    await service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'Good', principalRemarks: 'hack' }, teacherUser());
    expect(reportCardModel.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('principalRemarks');
  });
  it('principalRemarks only => nothing written', async () => {
    const { service, reportCardModel } = makeAssessmentService({ profile: classTeacher, reportCard: card });
    await service.updateReportCardRemarks(cardId, 's', { principalRemarks: 'hack' }, teacherUser());
    expect(reportCardModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('another teacher (not class teacher / other class) gets 403', async () => {
    const other = { isClassTeacher: true, classTeacherOfGradeName: 'Grade 6', classTeacherOfSectionName: 'A', currentAssignments: [] };
    const { service, reportCardModel } = makeAssessmentService({ profile: other, reportCard: card });
    await expect(service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'x' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    expect(reportCardModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('subject teacher of the class (not class teacher) gets 403', async () => {
    const subj = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A' }] };
    const { service } = makeAssessmentService({ profile: subj, reportCard: card });
    await expect(service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'x' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('wrong section 403', async () => {
    const { service } = makeAssessmentService({ profile: { ...classTeacher, classTeacherOfSectionName: 'B' }, reportCard: card });
    await expect(service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'x' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('no staff record => 403', async () => {
    const { service } = makeAssessmentService({ staff: null, reportCard: card });
    await expect(service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'x' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('unknown id => 404 (also malformed id)', async () => {
    const { service } = makeAssessmentService({ profile: classTeacher, reportCard: null });
    await expect(service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'x' }, teacherUser())).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateReportCardRemarks('nope', 's', { classTeacherRemarks: 'x' }, teacherUser())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe.each(['principal', 'admin', 'institution_owner', 'academic_coordinator'])('remarks %s unchanged', (role) => {
  it('passes the dto straight through (incl. principalRemarks), no staff lookup, unknown id -> empty 200', async () => {
    const { service, reportCardModel, staffModel } = makeAssessmentService({ reportCard: null });
    const r = await service.updateReportCardRemarks(cardId, 's', { classTeacherRemarks: 'a', principalRemarks: 'b' }, teacherUser({ role }));
    expect(reportCardModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { classTeacherRemarks: 'a', principalRemarks: 'b' } });
    expect(staffModel.findOne).not.toHaveBeenCalled();
    expect(r).toBeNull();
  });
});
