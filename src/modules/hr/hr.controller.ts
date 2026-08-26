import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Request, UseGuards, UseInterceptors, UploadedFile, Res, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { HrService } from './hr.service';

@Controller('hr')
@UseGuards(AuthGuard('jwt'))
export class HrController {
  constructor(private readonly hrService: HrService) {}

  // Falls back to tenantId when institutionId is missing from an already-issued JWT
  // (older tokens/users predate per-institution scoping); avoids "institutionId required" 500s.
  private iid(req: any): string { return req.user.institutionId || req.user.tenantId; }

  // ── Staff ────────────────────────────────────────────────────────────

  @Get('staff')
  getStaff(@Request() req, @Query('campusId') campusId?: string, @Query('department') department?: string) {
    return this.hrService.getStaff(req.user.tenantId, campusId, department, req.user);
  }

  @Post('staff')
  createStaff(@Request() req, @Body() body: any) { return this.hrService.createStaff(req.user.tenantId, body); }

  @Post('staff/:id/create-login')
  createLoginForStaff(@Request() req, @Param('id') id: string) {
    return this.hrService.createLoginForStaff(req.user.tenantId, this.iid(req), id);
  }

  @Post('staff/bulk-create-logins')
  bulkCreateLogins(@Request() req, @Body() body: { staffIds?: string[] }) {
    return this.hrService.bulkCreateLogins(req.user.tenantId, this.iid(req), body?.staffIds);
  }

  @Get('staff/:id')
  getStaffById(@Request() req, @Param('id') id: string) { return this.hrService.getStaffById(req.user.tenantId, id); }

  @Patch('staff/:id')
  updateStaff(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateStaff(req.user.tenantId, id, body); }

  @Get('staff/:id/attendance')
  getStaffAttendanceById(@Request() req, @Param('id') id: string) {
    return this.hrService.getStaffAttendance(req.user.tenantId, { staffId: id });
  }

  @Get('staff/:id/leave')
  getStaffLeave(@Request() req, @Param('id') id: string) {
    return this.hrService.getLeaveApplications(req.user.tenantId, { staffId: id });
  }

  @Get('staff/:id/payslips')
  getStaffPayslips(@Request() req, @Param('id') id: string) {
    return this.hrService.getPayslips(req.user.tenantId, { staffId: id });
  }

  @Post('staff/:id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  uploadStaffPhoto(@Request() req, @Param('id') id: string, @UploadedFile() photo: Express.Multer.File) {
    return this.hrService.uploadStaffPhoto(req.user.tenantId, id, photo, req.user.schoolSlug);
  }

  @Get('staff/:id/documents')
  getStaffDocuments(@Request() req, @Param('id') id: string) { return this.hrService.getStaffDocuments(req.user.tenantId, id); }

  @Post('staff/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadStaffDocument(@Request() req, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('label') label: string) {
    return this.hrService.addStaffDocument(req.user.tenantId, id, file, label, req.user.schoolSlug);
  }

  @Get('staff/:id/notes')
  getStaffNotes() { return []; }

  // ── Designations ─────────────────────────────────────────────────────

  @Get('designations')
  getDesignations(@Request() req) { return this.hrService.getDesignations(req.user.tenantId); }

  @Post('designations')
  createDesignation(@Request() req, @Body() body: any) { return this.hrService.createDesignation(req.user.tenantId, body); }

  // ── Leave Applications (legacy) ───────────────────────────────────────

  @Get('leave/applications')
  getLeaveApplications(@Request() req) { return this.hrService.getLeaveApplications(req.user.tenantId); }

  @Post('leave/applications')
  submitLeaveApplication(@Request() req, @Body() body: any) { return this.hrService.submitLeaveApplication(req.user.tenantId, body); }

  // ── Staff Lifecycle ───────────────────────────────────────────────────

  @Get('lifecycle')
  getLifecycle(@Request() req) { return this.hrService.getLifecycleCandidates(req.user.tenantId); }

  @Get('lifecycle/stats')
  getLifecycleStats(@Request() req) { return this.hrService.getLifecycleStats(req.user.tenantId); }

  @Get('lifecycle/:id')
  getLifecycleById(@Request() req, @Param('id') id: string) { return this.hrService.getLifecycleById(req.user.tenantId, id); }

  @Post('lifecycle')
  createCandidate(@Request() req, @Body() body: any) { return this.hrService.createCandidate(req.user.tenantId, this.iid(req), body); }

  @Patch('lifecycle/:id')
  updateCandidate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateCandidate(req.user.tenantId, id, body); }

  @Patch('lifecycle/:id/stage')
  moveToStage(@Request() req, @Param('id') id: string, @Body() body: { stage: string; note: string }) { return this.hrService.moveToStage(req.user.tenantId, id, body.stage, body.note, req.user.userId); }

  @Post('lifecycle/:id/interview')
  scheduleInterview(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.scheduleInterview(req.user.tenantId, id, body); }

  @Patch('lifecycle/:id/interview/:round/feedback')
  updateFeedback(@Request() req, @Param('id') id: string, @Param('round') round: string, @Body() body: any) { return this.hrService.updateInterviewFeedback(req.user.tenantId, id, parseInt(round), body); }

  @Post('lifecycle/:id/offer')
  makeOffer(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.makeOffer(req.user.tenantId, id, body); }

  @Patch('lifecycle/:id/offer/respond')
  respondToOffer(@Request() req, @Param('id') id: string, @Body() body: { response: string; note: string }) { return this.hrService.respondToOffer(req.user.tenantId, id, body.response, body.note); }

  @Patch('lifecycle/:id/onboarding/:taskIndex')
  updateOnboardingTask(@Request() req, @Param('id') id: string, @Param('taskIndex') taskIndex: string, @Body() body: { isDone: boolean }) { return this.hrService.updateOnboardingTask(req.user.tenantId, id, parseInt(taskIndex), body.isDone); }

  // ── Recruitment: Job Openings ─────────────────────────────────────────

  @Get('recruitment/stats')
  getRecruitmentStats(@Request() req) { return this.hrService.getRecruitmentStats(req.user.tenantId); }

  @Get('recruitment/jobs')
  getJobs(@Request() req, @Query() query: any) { return this.hrService.getJobOpenings(req.user.tenantId, query); }

  @Post('recruitment/jobs')
  createJob(@Request() req, @Body() body: any) { return this.hrService.createJobOpening(req.user.tenantId, this.iid(req), body, req.user.userId); }

  @Get('recruitment/jobs/:id')
  getJob(@Request() req, @Param('id') id: string) { return this.hrService.getJobOpeningById(req.user.tenantId, id); }

  @Patch('recruitment/jobs/:id')
  updateJob(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateJobOpening(req.user.tenantId, id, body); }

  // ── Recruitment: Applications ─────────────────────────────────────────

  @Get('recruitment/applications')
  getApplications(@Request() req, @Query() query: any) { return this.hrService.getApplications(req.user.tenantId, query); }

  @Post('recruitment/applications')
  createApplication(@Request() req, @Body() body: any) { return this.hrService.createApplication(req.user.tenantId, this.iid(req), body.jobId, body); }

  @Get('recruitment/applications/:id')
  getApplication(@Request() req, @Param('id') id: string) { return this.hrService.getApplicationById(req.user.tenantId, id); }

  @Patch('recruitment/applications/:id/stage')
  updateAppStage(@Request() req, @Param('id') id: string, @Body() body: { stage: string; note: string }) { return this.hrService.updateApplicationStage(req.user.tenantId, id, body.stage, body.note); }

  // ── Recruitment: Interview Schedule ───────────────────────────────────

  @Get('recruitment/interviews')
  getInterviews(@Request() req, @Query() query: any) { return this.hrService.getInterviewSchedule(req.user.tenantId, query); }

  @Post('recruitment/interviews')
  scheduleRecruitmentInterview(@Request() req, @Body() body: any) { return this.hrService.scheduleInterview2(req.user.tenantId, this.iid(req), body.applicationId, body, req.user.userId); }

  @Patch('recruitment/interviews/:id/feedback')
  submitFeedback(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateInterviewFeedback2(req.user.tenantId, id, body); }

  // ── ATTENDANCE ────────────────────────────────────────────────────────

  @Get('attendance/summary')
  getAttendanceSummary(@Request() req, @Query() q: any) { return this.hrService.getAttendanceSummary(req.user.tenantId, parseInt(q.month), parseInt(q.year)); }

  @Get('attendance')
  getAttendance(@Request() req, @Query() q: any) { return this.hrService.getStaffAttendance(req.user.tenantId, q); }

  @Post('attendance/bulk')
  markAttendance(@Request() req, @Body() body: { records: any[] }) { return this.hrService.markStaffAttendance(req.user.tenantId, this.iid(req), body.records); }

  @Delete('attendance')
  deleteAttendance(@Request() req, @Body() body: { date: string; staffIds: string[] }) {
    return this.hrService.deleteStaffAttendance(req.user.tenantId, body.date, body.staffIds);
  }

  @Post('attendance/biometric/config')
  saveBiometricConfig(@Request() req, @Body() body: any) { return this.hrService.saveBiometricConfig(req.user.tenantId, body); }

  @Post('attendance/biometric/sync')
  syncBiometricAttendance(@Request() req) { return this.hrService.syncBiometricAttendance(req.user.tenantId, this.iid(req)); }

  @Get('attendance/biometric/status')
  getBiometricStatus(@Request() req) { return this.hrService.getBiometricStatus(req.user.tenantId); }

  @Post('attendance/import')
  @UseInterceptors(FileInterceptor('file'))
  importAttendance(@Request() req, @UploadedFile() file: Express.Multer.File) { return this.hrService.importAttendanceCsv(req.user.tenantId, this.iid(req), file, req.user.schoolSlug); }

  // ── LEAVE ─────────────────────────────────────────────────────────────

  @Get('leave/stats')
  getLeaveStats(@Request() req) { return this.hrService.getLeaveStats(req.user.tenantId); }

  @Get('leave/balance/:staffId')
  getLeaveBalance(@Request() req, @Param('staffId') sid: string) { return this.hrService.getLeaveBalance(req.user.tenantId, sid); }

  // ── Leave Balances (bulk views, must be before generic leave/: routes) ─

  @Get('leave/balances')
  getAllLeaveBalances(@Request() req) { return this.hrService.getAllLeaveBalances(req.user.tenantId); }

  @Get('leave/balances/:staffId')
  getLeaveBalanceAlt(@Request() req, @Param('staffId') sid: string) { return this.hrService.getLeaveBalance(req.user.tenantId, sid); }

  @Post('leave/balances/allocate')
  allocateLeaveBalances(@Request() req, @Body() body: { policyId: string; academicYear?: string }) { return this.hrService.bulkAssignLeavePolicy(req.user.tenantId, body.policyId, body.academicYear); }

  // ── Leave Policies (must be before generic leave/: routes) ────────────

  @Post('leave/policies/seed-defaults')
  seedLeavePolicies(@Request() req) { return this.hrService.seedLeavePolicies(req.user.tenantId); }

  @Get('leave/policies')
  getLeavePolicies(@Request() req) { return this.hrService.getLeavePolicies(req.user.tenantId); }

  @Post('leave/policies')
  createLeavePolicy(@Request() req, @Body() body: any) { return this.hrService.createLeavePolicy(req.user.tenantId, body); }

  @Patch('leave/policies/:id')
  updateLeavePolicy(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateLeavePolicy(req.user.tenantId, id, body); }

  @Post('leave/policies/:id/assign')
  assignLeavePolicy(@Request() req, @Param('id') id: string, @Body() body: { staffId: string; academicYearId: string }) { return this.hrService.assignLeavePolicy(req.user.tenantId, id, body.staffId, body.academicYearId); }

  @Post('leave/policies/:id/bulk-assign')
  bulkAssignLeavePolicy(@Request() req, @Param('id') id: string, @Body() body: { academicYearId: string }) { return this.hrService.bulkAssignLeavePolicy(req.user.tenantId, id, body.academicYearId); }

  @Get('leave')
  getLeave(@Request() req, @Query() q: any) { return this.hrService.getLeaveApplications(req.user.tenantId, q); }

  @Post('leave')
  createLeave(@Request() req, @Body() body: any) { return this.hrService.createLeaveApplication(req.user.tenantId, this.iid(req), body); }

  @Patch('leave/:id/status')
  updateLeaveStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; note: string }) { return this.hrService.updateLeaveStatus(req.user.tenantId, id, body.status, req.user.userId, body.note); }

  // ── PAYROLL ───────────────────────────────────────────────────────────

  @Get('payroll/stats')
  getPayrollStats(@Request() req) { return this.hrService.getPayrollStats(req.user.tenantId); }

  @Get('payroll/runs')
  getPayrollRuns(@Request() req) { return this.hrService.getPayrollRuns(req.user.tenantId); }

  @Post('payroll/runs')
  createPayrollRun(@Request() req, @Body() body: any) { return this.hrService.createPayrollRun(req.user.tenantId, this.iid(req), body, req.user.userId); }

  @Patch('payroll/runs/:id/status')
  updatePayrollStatus(
    @Request() req, @Param('id') id: string,
    @Body() body: { status: string; paymentMethod?: string; bankAccountId?: string; referenceNumber?: string; paymentDate?: string },
  ) {
    return this.hrService.updatePayrollStatus(req.user.tenantId, id, body.status, req.user.userId, req.user.schoolSlug, body);
  }

  @Get('payroll/payments')
  getPayrollPayments(@Request() req, @Query('payrollRunId') payrollRunId?: string) {
    return this.hrService.getPayrollPayments(req.user.tenantId, payrollRunId);
  }

  @Post('payroll/runs/:id/process-batch')
  processPayrollBatch(@Request() req, @Param('id') id: string, @Body() body: { rows: any[] }) {
    return this.hrService.processPayrollBatch(req.user.tenantId, this.iid(req), req.user.schoolSlug, id, body.rows, req.user.userId);
  }

  @Delete('payroll/runs/:id')
  deletePayrollRun(@Request() req, @Param('id') id: string) {
    return this.hrService.deletePayrollRun(req.user.tenantId, id);
  }

  // ── PAYSLIPS ──────────────────────────────────────────────────────────

  @Get('payslips')
  getPayslips(@Request() req, @Query() q: any) { return this.hrService.getPayslips(req.user.tenantId, q); }

  @Post('payslips')
  createPayslip(@Request() req, @Body() body: any) { return this.hrService.createPayslip(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  // ── SALARY COMPONENTS (payroll configuration root system) ──────────────

  @Get('salary-components')
  getSalaryComponents(@Request() req) {
    return this.hrService.getSalaryComponents(req.user.tenantId, req.user.schoolSlug);
  }

  @Post('salary-components')
  createSalaryComponent(@Request() req, @Body() body: any) {
    return this.hrService.createSalaryComponent(req.user.tenantId, req.user.schoolSlug, body);
  }

  @Patch('salary-components/:id')
  updateSalaryComponent(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.hrService.updateSalaryComponent(id, req.user.schoolSlug, body);
  }

  @Delete('salary-components/:id')
  deleteSalaryComponent(@Request() req, @Param('id') id: string) {
    return this.hrService.deleteSalaryComponent(id, req.user.schoolSlug);
  }

  // ── SALARY TEMPLATES (addresses "everything is manual") ─────────────
  @Get('salary-templates')
  getSalaryTemplates(@Request() req) {
    return this.hrService.getSalaryTemplates(req.user.schoolSlug);
  }

  @Post('salary-templates')
  createSalaryTemplate(@Request() req, @Body() body: any) {
    return this.hrService.createSalaryTemplate(req.user.tenantId, req.user.schoolSlug, body);
  }

  @Patch('salary-templates/:id')
  updateSalaryTemplate(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.hrService.updateSalaryTemplate(id, req.user.schoolSlug, body);
  }

  @Delete('salary-templates/:id')
  deleteSalaryTemplate(@Request() req, @Param('id') id: string) {
    return this.hrService.deleteSalaryTemplate(id, req.user.schoolSlug);
  }

  @Patch('staff/:id/salary-structure')
  setStaffSalaryStructure(@Request() req, @Param('id') id: string, @Body() body: { lines: { componentId: string; amount: number }[] }) {
    return this.hrService.setStaffSalaryStructure(id, req.user.tenantId, req.user.schoolSlug, body.lines);
  }

  @Get('payslips/:id/pdf')
  async downloadPayslipPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generatePayslipPdf(id, req.user.tenantId, req.user.schoolSlug);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  // ── PERFORMANCE ───────────────────────────────────────────────────────

  @Get('performance')
  getPerformance(@Request() req, @Query() q: any) { return this.hrService.getPerformanceReviews(req.user.tenantId, q); }

  @Post('performance')
  createPerformance(@Request() req, @Body() body: any) { return this.hrService.createPerformanceReview(req.user.tenantId, this.iid(req), body); }

  @Patch('performance/:id')
  updatePerformance(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updatePerformanceReview(req.user.tenantId, id, body); }

  // ── TRAINING ──────────────────────────────────────────────────────────

  @Get('training')
  getTrainings(@Request() req) { return this.hrService.getTrainings(req.user.tenantId); }

  @Post('training')
  createTraining(@Request() req, @Body() body: any) { return this.hrService.createTraining(req.user.tenantId, this.iid(req), body, req.user.userId); }

  @Patch('training/:id')
  updateTraining(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateTraining(req.user.tenantId, id, body); }

  @Post('training/:id/enroll')
  enrollTraining(@Request() req, @Param('id') id: string, @Body() body: { staffId: string; staffName: string }) { return this.hrService.enrollInTraining(req.user.tenantId, id, body.staffId, body.staffName); }

  // ── CONTRACT WORDING TEMPLATES ──────────────────────────────────────
  // Registered before the plain 'contracts' routes below purely for
  // readability - 'contract-templates' is its own distinct literal path
  // segment so there's no NestJS route-ordering conflict with 'contracts'
  // or 'contracts/:id' either way.

  @Get('contract-templates')
  getContractTemplates(@Request() req) { return this.hrService.getContractTemplates(req.user.tenantId); }

  @Post('contract-templates')
  createContractTemplate(@Request() req, @Body() body: any) { return this.hrService.createContractTemplate(req.user.tenantId, req.user.schoolSlug, body, req.user.userId); }

  @Put('contract-templates/:id')
  updateContractTemplate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateContractTemplate(req.user.tenantId, id, body); }

  @Delete('contract-templates/:id')
  deleteContractTemplate(@Request() req, @Param('id') id: string) { return this.hrService.deleteContractTemplate(req.user.tenantId, id); }

  // ── CONTRACTS ─────────────────────────────────────────────────────────

  @Get('contracts/stats')
  getContractStats(@Request() req) { return this.hrService.getContractStats(req.user.tenantId); }

  @Get('contracts')
  getContracts(@Request() req, @Query() q: any) { return this.hrService.getContracts(req.user.tenantId, q); }

  @Post('contracts')
  createContract(@Request() req, @Body() body: any) { return this.hrService.createContract(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.userId); }

  @Patch('contracts/:id')
  updateContract(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateContract(req.user.tenantId, id, body); }

  @Get('contracts/:id/pdf')
  async downloadContractPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generateContractPdf(id, req.user.tenantId, req.user.schoolSlug, req.user.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="contract-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── OFFER LETTERS ────────────────────────────────────────────────────

  @Get('offer-letters')
  getOfferLetters(@Request() req, @Query() q: any) { return this.hrService.getOfferLetters(req.user.schoolSlug, q); }

  @Post('offer-letters')
  createOfferLetter(@Request() req, @Body() body: any) {
    return this.hrService.createOfferLetter(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.userId);
  }

  @Patch('offer-letters/:id/status')
  updateOfferLetterStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; declineReason?: string }) {
    return this.hrService.updateOfferLetterStatus(id, req.user.schoolSlug, body.status, body.declineReason ? { declineReason: body.declineReason } : {});
  }

  @Get('offer-letters/:id/pdf')
  async downloadOfferLetterPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generateOfferLetterPdf(id, req.user.schoolSlug);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="offer-letter-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── APPOINTMENT LETTERS ──────────────────────────────────────────────

  @Get('appointment-letters')
  getAppointmentLetters(@Request() req, @Query() q: any) { return this.hrService.getAppointmentLetters(req.user.schoolSlug, q); }

  @Post('appointment-letters')
  createAppointmentLetter(@Request() req, @Body() body: any) {
    return this.hrService.createAppointmentLetter(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.userId);
  }

  @Patch('appointment-letters/:id/status')
  updateAppointmentLetterStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string }) {
    return this.hrService.updateAppointmentLetterStatus(id, req.user.schoolSlug, body.status);
  }

  @Get('appointment-letters/:id/pdf')
  async downloadAppointmentLetterPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generateAppointmentLetterPdf(id, req.user.schoolSlug);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="appointment-letter-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── EXIT ──────────────────────────────────────────────────────────────

  @Get('exit')
  getExitRecords(@Request() req) { return this.hrService.getExitRecords(req.user.tenantId); }

  @Post('exit')
  createExitRecord(@Request() req, @Body() body: any) { return this.hrService.createExitRecord(req.user.tenantId, this.iid(req), body, req.user.userId, req.user.schoolSlug); }

  @Patch('exit/:id')
  updateExitRecord(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateExitRecord(req.user.tenantId, id, body); }

  @Patch('exit/:id/clearance/:index')
  updateClearance(@Request() req, @Param('id') id: string, @Param('index') idx: string, @Body() body: { isDone: boolean; clearedBy: string }) { return this.hrService.updateClearanceItem(req.user.tenantId, id, parseInt(idx), body.isDone, body.clearedBy); }

  @Get('exit-settings')
  getExitSettings(@Request() req) { return this.hrService.getExitSettings(req.user.tenantId, req.user.schoolSlug); }

  @Patch('exit-settings')
  updateExitSettings(@Request() req, @Body() body: any) { return this.hrService.updateExitSettings(req.user.tenantId, req.user.schoolSlug, body); }

  // ── HIRING SETTINGS ──────────────────────────────────────────────────

  @Get('hiring-settings')
  getHiringSettings(@Request() req) { return this.hrService.getHiringSettings(req.user.tenantId, req.user.schoolSlug); }

  @Patch('hiring-settings')
  updateHiringSettings(@Request() req, @Body() body: any) { return this.hrService.updateHiringSettings(req.user.tenantId, req.user.schoolSlug, body); }

  // ── ATTENDANCE SETTINGS ──────────────────────────────────────────────

  @Get('attendance-settings')
  getAttendanceSettings(@Request() req) { return this.hrService.getAttendanceSettings(req.user.tenantId, req.user.schoolSlug); }

  @Patch('attendance-settings')
  updateAttendanceSettings(@Request() req, @Body() body: any) { return this.hrService.updateAttendanceSettings(req.user.tenantId, req.user.schoolSlug, body); }

  // ── SHIFTS ─────────────────────────────────────────────────────────────

  @Get('shifts')
  getShifts(@Request() req) { return this.hrService.getShifts(req.user.tenantId, req.user.schoolSlug); }

  @Post('shifts')
  createShift(@Request() req, @Body() body: any) { return this.hrService.createShift(req.user.tenantId, req.user.schoolSlug, body); }

  @Patch('shifts/:id')
  updateShift(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateShift(id, req.user.schoolSlug, body); }

  @Delete('shifts/:id')
  deleteShift(@Request() req, @Param('id') id: string) { return this.hrService.deleteShift(id, req.user.schoolSlug); }

  @Patch('staff/:id/shift')
  assignStaffShift(@Request() req, @Param('id') id: string, @Body() body: { shiftId: string | null }) {
    return this.hrService.assignStaffShift(id, req.user.tenantId, body.shiftId);
  }

  @Patch('staff/:id/shifts')
  assignStaffShifts(@Request() req, @Param('id') id: string, @Body() body: { shiftIds: string[] }) {
    return this.hrService.assignStaffShifts(id, req.user.tenantId, body.shiftIds || []);
  }

  // ── REMINDERS (holidays + upcoming) ───────────────────────────────────

  @Get('holidays')
  getHolidays(@Request() req) { return this.hrService.getHolidays(req.user.tenantId, req.user.schoolSlug); }

  @Post('holidays')
  createHoliday(@Request() req, @Body() body: any) { return this.hrService.createHoliday(req.user.tenantId, req.user.schoolSlug, body); }

  @Patch('holidays/:id')
  updateHoliday(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateHoliday(id, req.user.schoolSlug, body); }

  @Delete('holidays/:id')
  deleteHoliday(@Request() req, @Param('id') id: string) { return this.hrService.deleteHoliday(id, req.user.schoolSlug); }

  @Get('reminders/upcoming')
  getUpcomingReminders(@Request() req, @Query('days') days?: string) {
    return this.hrService.getUpcomingReminders(req.user.tenantId, req.user.schoolSlug, days ? parseInt(days) : 30);
  }

  // ── GRIEVANCE ──────────────────────────────────────────────────────────

  @Get('grievances')
  getGrievances(@Request() req, @Query() query: any) { return this.hrService.getGrievances(req.user.tenantId, query); }

  @Get('grievances/:id')
  getGrievanceById(@Request() req, @Param('id') id: string) { return this.hrService.getGrievanceById(req.user.tenantId, id); }

  @Post('grievances')
  createGrievance(@Request() req, @Body() body: any) { return this.hrService.createGrievance(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  @Patch('grievances/:id/status')
  updateGrievanceStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; note: string; byName: string }) {
    return this.hrService.updateGrievanceStatus(req.user.tenantId, id, body.status, body.note, body.byName);
  }

  @Patch('grievances/:id/assign')
  assignGrievance(@Request() req, @Param('id') id: string, @Body() body: { assignedToStaffId: string; assignedToName: string }) {
    return this.hrService.assignGrievance(req.user.tenantId, id, body.assignedToStaffId, body.assignedToName);
  }

  // ── DAILY WORK SUMMARY ─────────────────────────────────────────────────

  @Get('daily-summaries')
  getDailyWorkSummaries(@Request() req, @Query() query: any) { return this.hrService.getDailyWorkSummaries(req.user.tenantId, query); }

  @Post('daily-summaries')
  upsertDailyWorkSummary(@Request() req, @Body() body: any) { return this.hrService.upsertDailyWorkSummary(req.user.tenantId, req.user.schoolSlug, body); }

  @Patch('daily-summaries/:id/acknowledge')
  acknowledgeDailyWorkSummary(@Request() req, @Param('id') id: string, @Body() body: { byName: string }) {
    return this.hrService.acknowledgeDailyWorkSummary(req.user.tenantId, id, body.byName);
  }

  @Get('daily-summaries/rollup')
  getDailyWorkSummaryRollup(@Request() req, @Query('date') date: string) {
    return this.hrService.getDailyWorkSummaryRollup(req.user.tenantId, req.user.schoolSlug, date || new Date().toISOString().split('T')[0]);
  }

  // ── EXPENSE CLAIMS ─────────────────────────────────────────────────────

  @Get('expense-claims')
  getExpenseClaims(@Request() req, @Query() query: any) { return this.hrService.getExpenseClaims(req.user.tenantId, query); }

  @Post('expense-claims')
  createExpenseClaim(@Request() req, @Body() body: any) { return this.hrService.createExpenseClaim(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  @Patch('expense-claims/:id/status')
  updateExpenseClaimStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; approvedBy?: string; rejectionReason?: string }) {
    return this.hrService.updateExpenseClaimStatus(req.user.tenantId, id, body.status, req.user.schoolSlug, body.approvedBy, body.rejectionReason);
  }

  @Post('expense-claims/:id/receipts')
  @UseInterceptors(FileInterceptor('file'))
  addExpenseClaimReceipt(@Request() req, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.hrService.addExpenseClaimReceipt(req.user.tenantId, id, file, req.user.schoolSlug);
  }

  // ── ADVANCES ───────────────────────────────────────────────────────────

  @Get('advances')
  getAdvances(@Request() req, @Query() query: any) { return this.hrService.getAdvances(req.user.tenantId, query); }

  @Post('advances')
  createAdvance(@Request() req, @Body() body: any) { return this.hrService.createAdvance(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  @Patch('advances/:id/status')
  updateAdvanceStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; approvedBy?: string }) {
    return this.hrService.updateAdvanceStatus(req.user.tenantId, id, body.status, req.user.schoolSlug, body.approvedBy);
  }
}
