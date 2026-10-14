import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Request, UseGuards, UseInterceptors, UploadedFile, Res, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { HrService } from './hr.service';
import { RequirePermission } from '../../auth/decorators';
import { HR_LEAVE_ADMIN_ROLES } from '../../auth/role-sets';
import { RolesOrModuleManage } from '../../roles/decorators/roles-or-module-manage.decorator';
import { CreateSelfLeaveDto } from './dto/self-leave.dto';
import { HrAccessGuard } from './guards/hr-access.guard';
import { HrWrite, HrRead, HrStaffDirectory } from './guards/hr-access.decorator';
import { PAYROLL_PAY_ROLES, PAYROLL_READ_ROLES } from '../../auth/admin-role-sets';
import { CriticalAuditService, AuditMeta } from '../../common/critical-audit.service';

@Controller('hr')
@UseGuards(AuthGuard('jwt'), HrAccessGuard)
export class HrController {
  constructor(private readonly hrService: HrService, private readonly audit: CriticalAuditService) {}

  // Payroll / salary writes are FAIL-CLOSED audited (before/after, masked):
  // if the audit entry cannot be written the change is not applied.
  private audited<T>(req: any, meta: AuditMeta, loadBefore: () => Promise<any>, mutate: () => Promise<T>): Promise<T> {
    const u = req.user || {};
    const ipAddress = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress;
    return this.audit.run(
      { schoolSlug: u.schoolSlug, userId: u.userId, name: u.name, ipAddress, userAgent: req.headers?.['user-agent'] },
      meta, loadBefore, mutate,
    );
  }
  private before(req: any, kind: string, id?: string) { return () => this.hrService.loadForAudit(kind as any, req.user.tenantId, req.user.schoolSlug, id); }

  // Falls back to tenantId when institutionId is missing from an already-issued JWT
  // (older tokens/users predate per-institution scoping); avoids "institutionId required" 500s.
  private iid(req: any): string { return req.user.institutionId || req.user.tenantId; }

  // ── Staff ────────────────────────────────────────────────────────────

  @HrStaffDirectory()
  @Get('staff')
  getStaff(@Request() req, @Query('campusId') campusId?: string, @Query('department') department?: string) {
    return this.hrService.getStaff(req.user.tenantId, campusId, department, req.user, req.hrFullAccess === true);
  }

  @HrWrite()
  @Post('staff')
  createStaff(@Request() req, @Body() body: any) { return this.hrService.createStaff(req.user.tenantId, body, req.user.schoolSlug); }

  @HrWrite()
  @Post('staff/:id/create-login')
  createLoginForStaff(@Request() req, @Param('id') id: string) {
    return this.hrService.createLoginForStaff(req.user.tenantId, this.iid(req), id);
  }

  @HrWrite()
  @Post('staff/:id/reset-password')
  resetPasswordForStaff(@Request() req, @Param('id') id: string) {
    return this.hrService.resetPasswordForStaff(req.user.tenantId, id);
  }

  @HrWrite()
  @Post('staff/bulk-create-logins')
  bulkCreateLogins(@Request() req, @Body() body: { staffIds?: string[] }) {
    return this.hrService.bulkCreateLogins(req.user.tenantId, this.iid(req), body?.staffIds);
  }

  @HrRead()
  @Get('staff/:id')
  getStaffById(@Request() req, @Param('id') id: string) { return this.hrService.getStaffById(req.user.tenantId, id); }

  @HrWrite()
  @Patch('staff/:id')
  updateStaff(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateStaff(req.user.tenantId, id, body); }

  @HrWrite()
  @Patch('staff/:id/reporting-manager')
  setReportingManager(@Request() req, @Param('id') id: string, @Body('managerId') managerId: string | null) {
    return this.hrService.setReportingManager(req.user.tenantId, id, managerId);
  }

  @HrWrite()
  @Delete('staff/:id')
  deleteStaff(@Request() req, @Param('id') id: string, @Query('hardDelete') hardDelete?: string) {
    return this.hrService.deleteStaff(req.user.tenantId, id, hardDelete === 'true');
  }

  @HrRead()
  @Get('staff/:id/attendance')
  getStaffAttendanceById(@Request() req, @Param('id') id: string) {
    return this.hrService.getStaffAttendance(req.user.tenantId, { staffId: id });
  }

  @HrRead()
  @Get('staff/:id/leave')
  getStaffLeave(@Request() req, @Param('id') id: string) {
    return this.hrService.getLeaveApplications(req.user.tenantId, { staffId: id });
  }

  @HrRead(PAYROLL_READ_ROLES)
  @Get('staff/:id/payslips')
  getStaffPayslips(@Request() req, @Param('id') id: string) {
    return this.hrService.getPayslips(req.user.tenantId, { staffId: id });
  }

  @HrWrite()
  @Post('staff/:id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  uploadStaffPhoto(@Request() req, @Param('id') id: string, @UploadedFile() photo: Express.Multer.File) {
    return this.hrService.uploadStaffPhoto(req.user.tenantId, id, photo, req.user.schoolSlug);
  }

  @HrRead()
  @Get('staff/:id/documents')
  getStaffDocuments(@Request() req, @Param('id') id: string) { return this.hrService.getStaffDocuments(req.user.tenantId, id); }

  @HrWrite()
  @Post('staff/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadStaffDocument(@Request() req, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('label') label: string) {
    return this.hrService.addStaffDocument(req.user.tenantId, id, file, label, req.user.schoolSlug);
  }

  @HrRead()
  @Get('staff/:id/notes')
  getStaffNotes() { return []; }

  // ── Designations ─────────────────────────────────────────────────────

  @HrRead()
  @Get('designations')
  getDesignations(@Request() req) { return this.hrService.getDesignations(req.user.tenantId); }

  @HrWrite()
  @Post('designations')
  createDesignation(@Request() req, @Body() body: any) { return this.hrService.createDesignation(req.user.tenantId, body); }

  // ── Leave Applications (legacy) ───────────────────────────────────────

  @HrRead()
  @Get('leave/applications')
  getLeaveApplications(@Request() req) { return this.hrService.getLeaveApplications(req.user.tenantId); }

  @HrWrite()
  @Post('leave/applications')
  submitLeaveApplication(@Request() req, @Body() body: any) { return this.hrService.submitLeaveApplication(req.user.tenantId, body); }

  // ── Staff Lifecycle ───────────────────────────────────────────────────

  @HrRead()
  @Get('lifecycle')
  getLifecycle(@Request() req) { return this.hrService.getLifecycleCandidates(req.user.tenantId); }

  @HrRead()
  @Get('lifecycle/stats')
  getLifecycleStats(@Request() req) { return this.hrService.getLifecycleStats(req.user.tenantId); }

  @HrRead()
  @Get('lifecycle/:id')
  getLifecycleById(@Request() req, @Param('id') id: string) { return this.hrService.getLifecycleById(req.user.tenantId, id); }

  @HrWrite()
  @Post('lifecycle')
  createCandidate(@Request() req, @Body() body: any) { return this.hrService.createCandidate(req.user.tenantId, this.iid(req), body); }

  @HrWrite()
  @Patch('lifecycle/:id')
  updateCandidate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateCandidate(req.user.tenantId, id, body); }

  @HrWrite()
  @Patch('lifecycle/:id/stage')
  moveToStage(@Request() req, @Param('id') id: string, @Body() body: { stage: string; note: string }) { return this.hrService.moveToStage(req.user.tenantId, id, body.stage, body.note, req.user.userId); }

  @HrWrite()
  @Post('lifecycle/:id/interview')
  scheduleInterview(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.scheduleInterview(req.user.tenantId, id, body); }

  @HrWrite()
  @Patch('lifecycle/:id/interview/:round/feedback')
  updateFeedback(@Request() req, @Param('id') id: string, @Param('round') round: string, @Body() body: any) { return this.hrService.updateInterviewFeedback(req.user.tenantId, id, parseInt(round), body); }

  @HrWrite()
  @Post('lifecycle/:id/offer')
  makeOffer(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.makeOffer(req.user.tenantId, id, body); }

  @HrWrite()
  @Patch('lifecycle/:id/offer/respond')
  respondToOffer(@Request() req, @Param('id') id: string, @Body() body: { response: string; note: string }) { return this.hrService.respondToOffer(req.user.tenantId, id, body.response, body.note); }

  @HrWrite()
  @Patch('lifecycle/:id/onboarding/:taskIndex')
  updateOnboardingTask(@Request() req, @Param('id') id: string, @Param('taskIndex') taskIndex: string, @Body() body: { isDone: boolean }) { return this.hrService.updateOnboardingTask(req.user.tenantId, id, parseInt(taskIndex), body.isDone); }

  // ── Recruitment: Job Openings ─────────────────────────────────────────

  @HrRead()
  @Get('recruitment/stats')
  getRecruitmentStats(@Request() req) { return this.hrService.getRecruitmentStats(req.user.tenantId); }

  @HrRead()
  @Get('recruitment/jobs')
  getJobs(@Request() req, @Query() query: any) { return this.hrService.getJobOpenings(req.user.tenantId, query); }

  @HrWrite()
  @Post('recruitment/jobs')
  createJob(@Request() req, @Body() body: any) { return this.hrService.createJobOpening(req.user.tenantId, this.iid(req), body, req.user.userId); }

  @HrRead()
  @Get('recruitment/jobs/:id')
  getJob(@Request() req, @Param('id') id: string) { return this.hrService.getJobOpeningById(req.user.tenantId, id); }

  @HrWrite()
  @Patch('recruitment/jobs/:id')
  updateJob(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateJobOpening(req.user.tenantId, id, body); }

  // ── Recruitment: Applications ─────────────────────────────────────────

  @HrRead()
  @Get('recruitment/applications')
  getApplications(@Request() req, @Query() query: any) { return this.hrService.getApplications(req.user.tenantId, query); }

  @HrWrite()
  @Post('recruitment/applications')
  createApplication(@Request() req, @Body() body: any) { return this.hrService.createApplication(req.user.tenantId, this.iid(req), body.jobId, body); }

  @HrRead()
  @Get('recruitment/applications/:id')
  getApplication(@Request() req, @Param('id') id: string) { return this.hrService.getApplicationById(req.user.tenantId, id); }

  @HrWrite()
  @Patch('recruitment/applications/:id/stage')
  updateAppStage(@Request() req, @Param('id') id: string, @Body() body: { stage: string; note: string }) { return this.hrService.updateApplicationStage(req.user.tenantId, id, body.stage, body.note); }

  // ── Recruitment: Interview Schedule ───────────────────────────────────

  @HrRead()
  @Get('recruitment/interviews')
  getInterviews(@Request() req, @Query() query: any) { return this.hrService.getInterviewSchedule(req.user.tenantId, query); }

  @HrWrite()
  @Post('recruitment/interviews')
  scheduleRecruitmentInterview(@Request() req, @Body() body: any) { return this.hrService.scheduleInterview2(req.user.tenantId, this.iid(req), body.applicationId, body, req.user.userId); }

  @HrWrite()
  @Patch('recruitment/interviews/:id/feedback')
  submitFeedback(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateInterviewFeedback2(req.user.tenantId, id, body); }

  // ── ATTENDANCE ────────────────────────────────────────────────────────

  @HrRead()
  @Get('attendance/summary')
  getAttendanceSummary(@Request() req, @Query() q: any) { return this.hrService.getAttendanceSummary(req.user.tenantId, parseInt(q.month), parseInt(q.year)); }

  @HrStaffDirectory()
  @Get('attendance')
  getAttendance(@Request() req, @Query() q: any) { return this.hrService.getStaffAttendance(req.user.tenantId, q); }

  @HrWrite()
  @Post('attendance/bulk')
  markAttendance(@Request() req, @Body() body: { records: any[] }) { return this.hrService.markStaffAttendance(req.user.tenantId, this.iid(req), body.records); }

  @HrWrite()
  @Delete('attendance')
  deleteAttendance(@Request() req, @Body() body: { date: string; staffIds: string[] }) {
    return this.hrService.deleteStaffAttendance(req.user.tenantId, body.date, body.staffIds);
  }

  @HrWrite()
  @Post('attendance/biometric/config')
  saveBiometricConfig(@Request() req, @Body() body: any) { return this.hrService.saveBiometricConfig(req.user.tenantId, body); }

  @HrWrite()
  @Post('attendance/biometric/sync')
  syncBiometricAttendance(@Request() req) { return this.hrService.syncBiometricAttendance(req.user.tenantId, this.iid(req)); }

  @HrRead()
  @Get('attendance/biometric/status')
  getBiometricStatus(@Request() req) { return this.hrService.getBiometricStatus(req.user.tenantId); }

  @HrWrite()
  @Post('attendance/import')
  @UseInterceptors(FileInterceptor('file'))
  importAttendance(@Request() req, @UploadedFile() file: Express.Multer.File) { return this.hrService.importAttendanceCsv(req.user.tenantId, this.iid(req), file, req.user.schoolSlug); }

  @HrRead()
  @Get('attendance/report')
  getAttendanceReport(@Request() req, @Query() q: any) {
    return this.hrService.getStaffAttendanceReport(req.user.tenantId, q, req.user);
  }

  @HrRead()
  @Get('attendance/summary-report')
  getAttendanceSummaryReport(@Request() req, @Query() q: any) {
    return this.hrService.getStaffAttendanceSummaryReport(req.user.tenantId, q, req.user);
  }

  @HrRead()
  @Get('attendance/muster-roll')
  getMusterRoll(@Request() req, @Query() q: any) {
    return this.hrService.getStaffMusterRoll(req.user.tenantId, { month: parseInt(q.month), year: parseInt(q.year), campusId: q.campusId, department: q.department }, req.user);
  }

  // ── LEAVE ─────────────────────────────────────────────────────────────

  // ── Self-service "My Leave" (leave:self) — narrowly scoped: a Teacher (or
  // any staff member without hr:read/hr:write) can read/write only their
  // OWN leave balance & requests. Ownership is resolved server-side from
  // req.user.userId → the caller's own Staff record; no client-supplied
  // staff/employee id is ever trusted here. Must stay ahead of the generic
  // 'leave/:...' routes below only in the sense that 'leave/self/...' is its
  // own static path — it never doubles as a way to read/write another
  // staff member's data.
  @RequirePermission('leave:self')
  @Get('leave/self/balance')
  getMyLeaveBalance(@Request() req) { return this.hrService.getMyLeaveBalance(req.user.tenantId, req.user.userId); }

  @RequirePermission('leave:self')
  @Get('leave/self/history')
  getMyLeaveHistory(@Request() req) { return this.hrService.getMyLeaveApplications(req.user.tenantId, req.user.userId); }

  @RequirePermission('leave:self')
  @Post('leave/self')
  createMyLeave(@Request() req, @Body() body: CreateSelfLeaveDto) {
    return this.hrService.createMyLeaveApplication(req.user.tenantId, this.iid(req), req.user.userId, body);
  }

  @HrRead()
  @Get('leave/stats')
  getLeaveStats(@Request() req) { return this.hrService.getLeaveStats(req.user.tenantId); }

  @HrRead()
  @Get('leave/balance/:staffId')
  getLeaveBalance(@Request() req, @Param('staffId') sid: string) { return this.hrService.getLeaveBalance(req.user.tenantId, sid); }

  // ── Leave Balances (bulk views, must be before generic leave/: routes) ─

  @HrRead()
  @Get('leave/balances')
  getAllLeaveBalances(@Request() req) { return this.hrService.getAllLeaveBalances(req.user.tenantId); }

  @HrRead()
  @Get('leave/balances/:staffId')
  getLeaveBalanceAlt(@Request() req, @Param('staffId') sid: string) { return this.hrService.getLeaveBalance(req.user.tenantId, sid); }

  @HrWrite()
  @Post('leave/balances/allocate')
  allocateLeaveBalances(@Request() req, @Body() body: { policyId: string; academicYear?: string }) { return this.hrService.bulkAssignLeavePolicy(req.user.tenantId, body.policyId, body.academicYear); }

  // ── Leave Policies (must be before generic leave/: routes) ────────────

  @HrWrite()
  @Post('leave/policies/seed-defaults')
  seedLeavePolicies(@Request() req) { return this.hrService.seedLeavePolicies(req.user.tenantId); }

  @HrRead()
  @Get('leave/policies')
  getLeavePolicies(@Request() req) { return this.hrService.getLeavePolicies(req.user.tenantId); }

  @HrWrite()
  @Post('leave/policies')
  createLeavePolicy(@Request() req, @Body() body: any) { return this.hrService.createLeavePolicy(req.user.tenantId, body); }

  @HrWrite()
  @Patch('leave/policies/:id')
  updateLeavePolicy(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateLeavePolicy(req.user.tenantId, id, body); }

  @HrWrite()
  @Post('leave/policies/:id/assign')
  assignLeavePolicy(@Request() req, @Param('id') id: string, @Body() body: { staffId: string; academicYearId: string }) { return this.hrService.assignLeavePolicy(req.user.tenantId, id, body.staffId, body.academicYearId); }

  @HrWrite()
  @Post('leave/policies/:id/bulk-assign')
  bulkAssignLeavePolicy(@Request() req, @Param('id') id: string, @Body() body: { academicYearId: string }) { return this.hrService.bulkAssignLeavePolicy(req.user.tenantId, id, body.academicYearId); }

  @HrRead()
  @Get('leave')
  getLeave(@Request() req, @Query() q: any) { return this.hrService.getLeaveApplications(req.user.tenantId, q); }

  @HrWrite()
  @Post('leave')
  createLeave(@Request() req, @Body() body: any) { return this.hrService.createLeaveApplication(req.user.tenantId, this.iid(req), body); }

  @RolesOrModuleManage('hr', HR_LEAVE_ADMIN_ROLES, { level: 'view' }) // web gates leave approval at hr:view
  @Patch('leave/:id/status')
  updateLeaveStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; note: string }) { return this.hrService.updateLeaveStatus(req.user.tenantId, id, body.status, req.user.userId, body.note, req.user.role, req.user.name); }

  // ── PAYROLL ───────────────────────────────────────────────────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('payroll/stats')
  getPayrollStats(@Request() req) { return this.hrService.getPayrollStats(req.user.tenantId); }

  @HrRead(PAYROLL_READ_ROLES)
  @Get('payroll/runs')
  getPayrollRuns(@Request() req) { return this.hrService.getPayrollRuns(req.user.tenantId); }

  @HrWrite()
  @Post('payroll/runs')
  createPayrollRun(@Request() req, @Body() body: any) { return this.audited(req, { module: 'HR: Payroll', action: 'Create payroll run', type: 'create', resourceType: 'PayrollRun', resourceId: undefined, requested: body }, async () => null, () => this.hrService.createPayrollRun(req.user.tenantId, this.iid(req), body, req.user.userId)); }

  @HrWrite(PAYROLL_PAY_ROLES)
  @Patch('payroll/runs/:id/status')
  updatePayrollStatus(
    @Request() req, @Param('id') id: string,
    @Body() body: { status: string; paymentMethod?: string; bankAccountId?: string; referenceNumber?: string; paymentDate?: string },
  ) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Change payroll run status', type: 'update', resourceType: 'PayrollRun', resourceId: id, requested: body }, this.before(req, 'payrollRun', id), () => this.hrService.updatePayrollStatus(req.user.tenantId, id, body.status, req.user.userId, req.user.schoolSlug, body));
  }

  @HrRead(PAYROLL_READ_ROLES)
  @Get('payroll/payments')
  getPayrollPayments(@Request() req, @Query('payrollRunId') payrollRunId?: string) {
    return this.hrService.getPayrollPayments(req.user.tenantId, payrollRunId);
  }

  @HrWrite(PAYROLL_PAY_ROLES)
  @Post('payroll/runs/:id/process-batch')
  processPayrollBatch(@Request() req, @Param('id') id: string, @Body() body: { rows: any[] }) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Process payroll batch', type: 'update', resourceType: 'PayrollRun', resourceId: id, requested: { rows: (body.rows || []).length } }, this.before(req, 'payrollRun', id), () => this.hrService.processPayrollBatch(req.user.tenantId, this.iid(req), req.user.schoolSlug, id, body.rows, req.user.userId));
  }

  @HrWrite()
  @Delete('payroll/runs/:id')
  deletePayrollRun(@Request() req, @Param('id') id: string) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Delete payroll run', type: 'delete', resourceType: 'PayrollRun', resourceId: id, requested: { id } }, this.before(req, 'payrollRun', id), () => this.hrService.deletePayrollRun(req.user.tenantId, id));
  }

  @HrWrite()
  @Post('payroll/recompute-totals')
  recomputePayslipTotals(@Request() req, @Body() body: { dryRun?: boolean }) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Recompute payslip totals', type: 'update', resourceType: 'Payslip', resourceId: undefined, requested: { dryRun: body.dryRun !== false } }, async () => null, () => this.hrService.recomputePayslipTotals(req.user.tenantId, req.user.schoolSlug, body.dryRun !== false));
  }

  @HrWrite()
  @Post('payroll/sync-payslip-statuses')
  syncPayslipStatuses(@Request() req) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Sync payslip statuses', type: 'update', resourceType: 'Payslip', resourceId: undefined, requested: {} }, async () => null, () => this.hrService.syncPayslipStatuses(req.user.tenantId));
  }

  // ── PAYSLIPS ──────────────────────────────────────────────────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('payslips')
  getPayslips(@Request() req, @Query() q: any) { return this.hrService.getPayslips(req.user.tenantId, q); }

  @HrWrite()
  @Post('payslips')
  createPayslip(@Request() req, @Body() body: any) { return this.audited(req, { module: 'HR: Payroll', action: 'Create payslip', type: 'create', resourceType: 'Payslip', resourceId: undefined, requested: body }, async () => null, () => this.hrService.createPayslip(req.user.tenantId, this.iid(req), req.user.schoolSlug, body)); }

  @HrWrite()
  @Patch('payslips/:id')
  updatePayslip(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Update payslip', type: 'update', resourceType: 'Payslip', resourceId: id, requested: body }, this.before(req, 'payslip', id), () => this.hrService.updatePayslip(req.user.tenantId, id, body));
  }

  @HrWrite(PAYROLL_PAY_ROLES)
  @Post('payslips/:id/pay')
  payIndividualPayslip(@Request() req, @Param('id') id: string, @Body() body: { paymentMethod?: string; bankAccountId?: string; referenceNumber?: string; paymentDate?: string }) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Pay payslip', type: 'update', resourceType: 'Payslip', resourceId: id, requested: body }, this.before(req, 'payslip', id), () => this.hrService.payIndividualPayslip(req.user.tenantId, req.user.schoolSlug, id, req.user.userId, body));
  }

  // ── SALARY COMPONENTS (payroll configuration root system) ──────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('salary-components')
  getSalaryComponents(@Request() req) {
    return this.hrService.getSalaryComponents(req.user.tenantId, req.user.schoolSlug);
  }

  @HrWrite()
  @Post('salary-components')
  createSalaryComponent(@Request() req, @Body() body: any) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Create salary component', type: 'create', resourceType: 'SalaryComponent', resourceId: undefined, requested: body }, async () => null, () => this.hrService.createSalaryComponent(req.user.tenantId, req.user.schoolSlug, body));
  }

  @HrWrite()
  @Patch('salary-components/:id')
  updateSalaryComponent(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Update salary component', type: 'update', resourceType: 'SalaryComponent', resourceId: id, requested: body }, this.before(req, 'salaryComponent', id), () => this.hrService.updateSalaryComponent(id, req.user.schoolSlug, body));
  }

  @HrWrite()
  @Delete('salary-components/:id')
  deleteSalaryComponent(@Request() req, @Param('id') id: string) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Delete salary component', type: 'delete', resourceType: 'SalaryComponent', resourceId: id, requested: { id } }, this.before(req, 'salaryComponent', id), () => this.hrService.deleteSalaryComponent(id, req.user.schoolSlug));
  }

  // ── SALARY TEMPLATES (addresses "everything is manual") ─────────────
  @HrRead(PAYROLL_READ_ROLES)
  @Get('salary-templates')
  getSalaryTemplates(@Request() req) {
    return this.hrService.getSalaryTemplates(req.user.schoolSlug);
  }

  @HrWrite()
  @Post('salary-templates')
  createSalaryTemplate(@Request() req, @Body() body: any) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Create salary template', type: 'create', resourceType: 'SalaryTemplate', resourceId: undefined, requested: body }, async () => null, () => this.hrService.createSalaryTemplate(req.user.tenantId, req.user.schoolSlug, body));
  }

  @HrWrite()
  @Patch('salary-templates/:id')
  updateSalaryTemplate(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Update salary template', type: 'update', resourceType: 'SalaryTemplate', resourceId: id, requested: body }, this.before(req, 'salaryTemplate', id), () => this.hrService.updateSalaryTemplate(id, req.user.schoolSlug, body));
  }

  @HrWrite()
  @Delete('salary-templates/:id')
  deleteSalaryTemplate(@Request() req, @Param('id') id: string) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Delete salary template', type: 'delete', resourceType: 'SalaryTemplate', resourceId: id, requested: { id } }, this.before(req, 'salaryTemplate', id), () => this.hrService.deleteSalaryTemplate(id, req.user.schoolSlug));
  }

  @HrWrite()
  @Patch('staff/:id/salary-structure')
  setStaffSalaryStructure(@Request() req, @Param('id') id: string, @Body() body: { lines: { componentId: string; amount: number }[] }) {
    return this.audited(req, { module: 'HR: Payroll', action: 'Set staff salary structure', type: 'update', resourceType: 'Staff', resourceId: id, requested: body }, this.before(req, 'staffSalary', id), () => this.hrService.setStaffSalaryStructure(id, req.user.tenantId, req.user.schoolSlug, body.lines));
  }

  @HrRead(PAYROLL_READ_ROLES)
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

  @HrRead()
  @Get('performance')
  getPerformance(@Request() req, @Query() q: any) { return this.hrService.getPerformanceReviews(req.user.tenantId, q); }

  @HrWrite()
  @Post('performance')
  createPerformance(@Request() req, @Body() body: any) { return this.hrService.createPerformanceReview(req.user.tenantId, this.iid(req), body); }

  @HrWrite()
  @Patch('performance/:id')
  updatePerformance(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updatePerformanceReview(req.user.tenantId, id, body); }

  // ── TRAINING ──────────────────────────────────────────────────────────

  @HrRead()
  @Get('training')
  getTrainings(@Request() req) { return this.hrService.getTrainings(req.user.tenantId); }

  @HrWrite()
  @Post('training')
  createTraining(@Request() req, @Body() body: any) { return this.hrService.createTraining(req.user.tenantId, this.iid(req), body, req.user.userId); }

  @HrWrite()
  @Patch('training/:id')
  updateTraining(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateTraining(req.user.tenantId, id, body); }

  @HrWrite()
  @Post('training/:id/enroll')
  enrollTraining(@Request() req, @Param('id') id: string, @Body() body: { staffId: string; staffName: string }) { return this.hrService.enrollInTraining(req.user.tenantId, id, body.staffId, body.staffName); }

  // ── CONTRACT WORDING TEMPLATES ──────────────────────────────────────
  // Registered before the plain 'contracts' routes below purely for
  // readability - 'contract-templates' is its own distinct literal path
  // segment so there's no NestJS route-ordering conflict with 'contracts'
  // or 'contracts/:id' either way.

  @HrRead()
  @Get('contract-templates')
  getContractTemplates(@Request() req) { return this.hrService.getContractTemplates(req.user.tenantId); }

  @HrWrite()
  @Post('contract-templates')
  createContractTemplate(@Request() req, @Body() body: any) { return this.hrService.createContractTemplate(req.user.tenantId, req.user.schoolSlug, body, req.user.userId); }

  @HrWrite()
  @Put('contract-templates/:id')
  updateContractTemplate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateContractTemplate(req.user.tenantId, id, body); }

  @HrWrite()
  @Delete('contract-templates/:id')
  deleteContractTemplate(@Request() req, @Param('id') id: string) { return this.hrService.deleteContractTemplate(req.user.tenantId, id); }

  // ── CONTRACTS ─────────────────────────────────────────────────────────

  @HrRead()
  @Get('contracts/stats')
  getContractStats(@Request() req) { return this.hrService.getContractStats(req.user.tenantId); }

  @HrRead()
  @Get('contracts')
  getContracts(@Request() req, @Query() q: any) { return this.hrService.getContracts(req.user.tenantId, q); }

  @HrWrite()
  @Post('contracts')
  createContract(@Request() req, @Body() body: any) { return this.hrService.createContract(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.userId); }

  @HrWrite()
  @Patch('contracts/:id')
  updateContract(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateContract(req.user.tenantId, id, body); }

  @HrRead()
  @Get('contracts/:id/pdf')
  async downloadContractPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generateContractPdf(id, req.user.tenantId, req.user.schoolSlug, req.user.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="contract-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── OFFER LETTER WORDING TEMPLATES (HR-02) ────────────────────────────
  // Same route-ordering rationale as contract-templates above.

  @HrRead()
  @Get('offer-letter-templates')
  getOfferLetterTemplates(@Request() req) { return this.hrService.getOfferLetterTemplates(req.user.tenantId); }

  @HrWrite()
  @Post('offer-letter-templates')
  createOfferLetterTemplate(@Request() req, @Body() body: any) { return this.hrService.createOfferLetterTemplate(req.user.tenantId, req.user.schoolSlug, body, req.user.userId); }

  @HrWrite()
  @Put('offer-letter-templates/:id')
  updateOfferLetterTemplate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateOfferLetterTemplate(req.user.tenantId, id, body); }

  @HrWrite()
  @Delete('offer-letter-templates/:id')
  deleteOfferLetterTemplate(@Request() req, @Param('id') id: string) { return this.hrService.deleteOfferLetterTemplate(req.user.tenantId, id); }

  // ── OFFER LETTERS ────────────────────────────────────────────────────

  @HrRead()
  @Get('offer-letters')
  getOfferLetters(@Request() req, @Query() q: any) { return this.hrService.getOfferLetters(req.user.schoolSlug, q); }

  @HrWrite()
  @Post('offer-letters')
  createOfferLetter(@Request() req, @Body() body: any) {
    return this.hrService.createOfferLetter(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.userId);
  }

  @HrWrite()
  @Patch('offer-letters/:id/status')
  updateOfferLetterStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; declineReason?: string }) {
    return this.hrService.updateOfferLetterStatus(id, req.user.schoolSlug, body.status, body.declineReason ? { declineReason: body.declineReason } : {});
  }

  @HrRead()
  @Get('offer-letters/:id/pdf')
  async downloadOfferLetterPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generateOfferLetterPdf(id, req.user.schoolSlug, req.user.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="offer-letter-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── APPOINTMENT LETTERS ──────────────────────────────────────────────

  @HrRead()
  @Get('appointment-letters')
  getAppointmentLetters(@Request() req, @Query() q: any) { return this.hrService.getAppointmentLetters(req.user.schoolSlug, q); }

  @HrWrite()
  @Post('appointment-letters')
  createAppointmentLetter(@Request() req, @Body() body: any) {
    return this.hrService.createAppointmentLetter(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.userId);
  }

  @HrWrite()
  @Patch('appointment-letters/:id/status')
  updateAppointmentLetterStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string }) {
    return this.hrService.updateAppointmentLetterStatus(id, req.user.schoolSlug, body.status);
  }

  @HrRead()
  @Get('appointment-letters/:id/pdf')
  async downloadAppointmentLetterPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.hrService.generateAppointmentLetterPdf(id, req.user.schoolSlug);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="appointment-letter-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── EXIT ──────────────────────────────────────────────────────────────

  @HrRead()
  @Get('exit')
  getExitRecords(@Request() req) { return this.hrService.getExitRecords(req.user.tenantId); }

  @HrWrite()
  @Post('exit')
  createExitRecord(@Request() req, @Body() body: any) { return this.hrService.createExitRecord(req.user.tenantId, this.iid(req), body, req.user.userId, req.user.schoolSlug); }

  @HrWrite()
  @Patch('exit/:id')
  updateExitRecord(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateExitRecord(req.user.tenantId, id, body); }

  @HrWrite()
  @Patch('exit/:id/clearance/:index')
  updateClearance(@Request() req, @Param('id') id: string, @Param('index') idx: string, @Body() body: { isDone: boolean; clearedBy: string }) { return this.hrService.updateClearanceItem(req.user.tenantId, id, parseInt(idx), body.isDone, body.clearedBy); }

  @HrRead()
  @Get('exit-settings')
  getExitSettings(@Request() req) { return this.hrService.getExitSettings(req.user.tenantId, req.user.schoolSlug); }

  @HrWrite()
  @Patch('exit-settings')
  updateExitSettings(@Request() req, @Body() body: any) { return this.hrService.updateExitSettings(req.user.tenantId, req.user.schoolSlug, body); }

  // ── HIRING SETTINGS ──────────────────────────────────────────────────

  @HrRead()
  @Get('hiring-settings')
  getHiringSettings(@Request() req) { return this.hrService.getHiringSettings(req.user.tenantId, req.user.schoolSlug); }

  @HrWrite()
  @Patch('hiring-settings')
  updateHiringSettings(@Request() req, @Body() body: any) { return this.hrService.updateHiringSettings(req.user.tenantId, req.user.schoolSlug, body); }

  // ── ATTENDANCE SETTINGS ──────────────────────────────────────────────

  @HrRead()
  @Get('attendance-settings')
  getAttendanceSettings(@Request() req) { return this.hrService.getAttendanceSettings(req.user.tenantId, req.user.schoolSlug); }

  @HrWrite()
  @Patch('attendance-settings')
  updateAttendanceSettings(@Request() req, @Body() body: any) { return this.hrService.updateAttendanceSettings(req.user.tenantId, req.user.schoolSlug, body); }

  // ── SHIFTS ─────────────────────────────────────────────────────────────

  @HrRead()
  @Get('shifts')
  getShifts(@Request() req) { return this.hrService.getShifts(req.user.tenantId, req.user.schoolSlug); }

  @HrWrite()
  @Post('shifts')
  createShift(@Request() req, @Body() body: any) { return this.hrService.createShift(req.user.tenantId, req.user.schoolSlug, body); }

  @HrWrite()
  @Patch('shifts/:id')
  updateShift(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateShift(id, req.user.schoolSlug, body); }

  @HrWrite()
  @Delete('shifts/:id')
  deleteShift(@Request() req, @Param('id') id: string) { return this.hrService.deleteShift(id, req.user.schoolSlug); }

  @HrWrite()
  @Patch('staff/:id/shift')
  assignStaffShift(@Request() req, @Param('id') id: string, @Body() body: { shiftId: string | null }) {
    return this.hrService.assignStaffShift(id, req.user.tenantId, body.shiftId);
  }

  @HrWrite()
  @Patch('staff/:id/shifts')
  assignStaffShifts(@Request() req, @Param('id') id: string, @Body() body: { shiftIds: string[] }) {
    return this.hrService.assignStaffShifts(id, req.user.tenantId, body.shiftIds || []);
  }

  // ── REMINDERS (holidays + upcoming) ───────────────────────────────────

  @HrRead()
  @Get('holidays')
  getHolidays(@Request() req) { return this.hrService.getHolidays(req.user.tenantId, req.user.schoolSlug); }

  @HrWrite()
  @Post('holidays')
  createHoliday(@Request() req, @Body() body: any) { return this.hrService.createHoliday(req.user.tenantId, req.user.schoolSlug, body); }

  @HrWrite()
  @Patch('holidays/:id')
  updateHoliday(@Request() req, @Param('id') id: string, @Body() body: any) { return this.hrService.updateHoliday(id, req.user.schoolSlug, body); }

  @HrWrite()
  @Delete('holidays/:id')
  deleteHoliday(@Request() req, @Param('id') id: string) { return this.hrService.deleteHoliday(id, req.user.schoolSlug); }

  @HrRead()
  @Get('reminders/upcoming')
  getUpcomingReminders(@Request() req, @Query('days') days?: string) {
    return this.hrService.getUpcomingReminders(req.user.tenantId, req.user.schoolSlug, days ? parseInt(days) : 30);
  }

  // ── GRIEVANCE ──────────────────────────────────────────────────────────

  @HrRead()
  @Get('grievances')
  getGrievances(@Request() req, @Query() query: any) { return this.hrService.getGrievances(req.user.tenantId, query); }

  @HrRead()
  @Get('grievances/:id')
  getGrievanceById(@Request() req, @Param('id') id: string) { return this.hrService.getGrievanceById(req.user.tenantId, id); }

  @HrWrite()
  @Post('grievances')
  createGrievance(@Request() req, @Body() body: any) { return this.hrService.createGrievance(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  @HrWrite()
  @Patch('grievances/:id/status')
  updateGrievanceStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; note: string; byName: string }) {
    return this.hrService.updateGrievanceStatus(req.user.tenantId, id, body.status, body.note, body.byName);
  }

  @HrWrite()
  @Patch('grievances/:id/assign')
  assignGrievance(@Request() req, @Param('id') id: string, @Body() body: { assignedToStaffId: string; assignedToName: string }) {
    return this.hrService.assignGrievance(req.user.tenantId, id, body.assignedToStaffId, body.assignedToName);
  }

  // ── DAILY WORK SUMMARY ─────────────────────────────────────────────────

  @HrRead()
  @Get('daily-summaries')
  getDailyWorkSummaries(@Request() req, @Query() query: any) { return this.hrService.getDailyWorkSummaries(req.user.tenantId, query); }

  @HrWrite()
  @Post('daily-summaries')
  upsertDailyWorkSummary(@Request() req, @Body() body: any) { return this.hrService.upsertDailyWorkSummary(req.user.tenantId, req.user.schoolSlug, body); }

  @HrWrite()
  @Patch('daily-summaries/:id/acknowledge')
  acknowledgeDailyWorkSummary(@Request() req, @Param('id') id: string, @Body() body: { byName: string }) {
    return this.hrService.acknowledgeDailyWorkSummary(req.user.tenantId, id, body.byName);
  }

  @HrRead()
  @Get('daily-summaries/rollup')
  getDailyWorkSummaryRollup(@Request() req, @Query('date') date: string) {
    return this.hrService.getDailyWorkSummaryRollup(req.user.tenantId, req.user.schoolSlug, date || new Date().toISOString().split('T')[0]);
  }

  // ── EXPENSE CLAIMS ─────────────────────────────────────────────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('expense-claims')
  getExpenseClaims(@Request() req, @Query() query: any) { return this.hrService.getExpenseClaims(req.user.tenantId, query); }

  @HrWrite()
  @Post('expense-claims')
  createExpenseClaim(@Request() req, @Body() body: any) { return this.hrService.createExpenseClaim(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  @HrWrite()
  @Patch('expense-claims/:id/status')
  updateExpenseClaimStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; approvedBy?: string; rejectionReason?: string }) {
    return this.hrService.updateExpenseClaimStatus(req.user.tenantId, id, body.status, req.user.schoolSlug, body.approvedBy, body.rejectionReason);
  }

  @HrWrite()
  @Post('expense-claims/:id/receipts')
  @UseInterceptors(FileInterceptor('file'))
  addExpenseClaimReceipt(@Request() req, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.hrService.addExpenseClaimReceipt(req.user.tenantId, id, file, req.user.schoolSlug);
  }

  // ── ADVANCES ───────────────────────────────────────────────────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('advances')
  getAdvances(@Request() req, @Query() query: any) { return this.hrService.getAdvances(req.user.tenantId, query); }

  @HrWrite()
  @Post('advances')
  createAdvance(@Request() req, @Body() body: any) { return this.hrService.createAdvance(req.user.tenantId, this.iid(req), req.user.schoolSlug, body); }

  @HrWrite()
  @Patch('advances/:id/status')
  updateAdvanceStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string; approvedBy?: string }) {
    return this.hrService.updateAdvanceStatus(req.user.tenantId, id, body.status, req.user.schoolSlug, body.approvedBy);
  }

  // ── STAFF INCREMENTS ───────────────────────────────────────────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('increments')
  getIncrements(@Request() req, @Query() query: any) { return this.hrService.getIncrements(req.user.tenantId, query); }

  @HrWrite()
  @Post('increments')
  createIncrement(@Request() req, @Body() body: any) {
    return this.hrService.createIncrement(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.name);
  }

  // ── SECURITY DEPOSITS ──────────────────────────────────────────────────

  @HrRead(PAYROLL_READ_ROLES)
  @Get('security-deposits')
  getSecurityDeposits(@Request() req, @Query() query: any) { return this.hrService.getSecurityDeposits(req.user.tenantId, query); }

  @HrWrite()
  @Post('security-deposits')
  createSecurityDeposit(@Request() req, @Body() body: any) {
    return this.hrService.createSecurityDeposit(req.user.tenantId, this.iid(req), req.user.schoolSlug, body, req.user.name);
  }

  @HrWrite()
  @Post('security-deposits/:id/deductions')
  recordSecurityDepositDeduction(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.hrService.recordSecurityDepositDeduction(req.user.tenantId, id, body, req.user.name);
  }

  @HrWrite()
  @Post('security-deposits/:id/refund')
  refundSecurityDeposit(@Request() req, @Param('id') id: string, @Body() body: { amount?: number; notes?: string; forfeit?: boolean }) {
    return this.hrService.refundSecurityDeposit(req.user.tenantId, id, req.user.schoolSlug, body, req.user.name);
  }

  // ── REPORTS: STAFF LIST / ALLOCATION / SALARY / NEW / LEFT ────────────

  @HrRead()
  @Get('reports/org-chart')
  getOrgChart(@Request() req) { return this.hrService.getOrgChart(req.user.tenantId, req.user); }

  @HrRead()
  @Get('reports/staff-list')
  getStaffListReport(@Request() req, @Query() query: any) { return this.hrService.getStaffListReport(req.user.tenantId, query, req.user); }

  @HrRead()
  @Get('reports/staff-allocation')
  getStaffAllocationReport(@Request() req, @Query() query: any) { return this.hrService.getStaffAllocationReport(req.user.tenantId, query, req.user); }

  @HrRead(PAYROLL_READ_ROLES)
  @Get('reports/staff-salary')
  getStaffSalaryReport(@Request() req, @Query() query: any) { return this.hrService.getStaffSalaryReport(req.user.tenantId, query, req.user); }

  @HrRead()
  @Get('reports/new-staff')
  getNewStaffReport(@Request() req, @Query('from') from?: string, @Query('to') to?: string, @Query('staffId') staffId?: string) {
    return this.hrService.getNewStaffReport(req.user.tenantId, from, to, req.user, staffId);
  }

  @HrRead()
  @Get('reports/staff-left')
  getStaffLeftReport(@Request() req, @Query('from') from?: string, @Query('to') to?: string, @Query('staffId') staffId?: string) {
    return this.hrService.getStaffLeftReport(req.user.tenantId, from, to, staffId);
  }

  @HrRead()
  @Get('staff/:id/file-cover')
  async getStaffFileCoverPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.hrService.generateStaffFileCoverPdf(req.user.tenantId, req.user.schoolSlug, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="file-cover-${id}.pdf"` });
    res.status(HttpStatus.OK).send(buffer);
  }
}
