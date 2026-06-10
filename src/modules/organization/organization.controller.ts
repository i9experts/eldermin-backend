import { Controller, Get, Post, Patch, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrganizationService } from './organization.service';

@Controller('org')
@UseGuards(AuthGuard('jwt'))
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Get('institution')
  getInstitution(@Request() req) {
    return this.orgService.getInstitution(req.user.tenantId);
  }

  @Patch('institution')
  updateInstitution(@Request() req, @Body() body: any) {
    return this.orgService.updateInstitution(req.user.tenantId, body);
  }

  @Get('campuses')
  getCampuses(@Request() req) {
    return this.orgService.getCampuses(req.user.tenantId);
  }

  @Post('campuses')
  createCampus(@Request() req, @Body() body: any) {
    return this.orgService.createCampus(req.user.tenantId, body);
  }

  @Patch('campuses/:id')
  updateCampus(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.orgService.updateCampus(req.user.tenantId, id, body);
  }

  @Delete('campuses/:id')
  deleteCampus(@Request() req, @Param('id') id: string) {
    return this.orgService.deleteCampus(req.user.tenantId, id);
  }

  @Get('academic-years')
  getAcademicYears(@Request() req) {
    return this.orgService.getAcademicYears(req.user.tenantId);
  }

  @Post('academic-years')
  createAcademicYear(@Request() req, @Body() body: any) {
    return this.orgService.createAcademicYear(req.user.tenantId, body);
  }

  @Get('academic-years/current')
  getCurrentYear(@Request() req) {
    return this.orgService.getCurrentYear(req.user.tenantId);
  }

  @Get('departments')
  getDepartments(@Request() req) {
    return this.orgService.getDepartments(req.user.tenantId);
  }

  @Post('departments')
  createDepartment(@Request() req, @Body() body: any) {
    return this.orgService.createDepartment(req.user.tenantId, body);
  }

  @Patch('departments/:id')
  updateDepartment(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.orgService.updateDepartment(req.user.tenantId, id, body);
  }

  @Delete('departments/:id')
  deleteDepartment(@Request() req, @Param('id') id: string) {
    return this.orgService.deleteDepartment(req.user.tenantId, id);
  }

  @Get('committees')
  getCommittees(@Request() req) {
    return this.orgService.getCommittees(req.user.tenantId);
  }

  @Post('committees')
  createCommittee(@Request() req, @Body() body: any) {
    return this.orgService.createCommittee(req.user.tenantId, body);
  }

  @Patch('committees/:id')
  updateCommittee(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.orgService.updateCommittee(req.user.tenantId, id, body);
  }

  @Delete('committees/:id')
  deleteCommittee(@Request() req, @Param('id') id: string) {
    return this.orgService.deleteCommittee(req.user.tenantId, id);
  }

  @Get('board')
  getBoardMembers(@Request() req) {
    return this.orgService.getBoardMembers(req.user.tenantId);
  }

  @Post('board')
  createBoardMember(@Request() req, @Body() body: any) {
    return this.orgService.createBoardMember(req.user.tenantId, body);
  }

  @Patch('board/:id')
  updateBoardMember(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.orgService.updateBoardMember(req.user.tenantId, id, body);
  }

  @Delete('board/:id')
  deleteBoardMember(@Request() req, @Param('id') id: string) {
    return this.orgService.deleteBoardMember(req.user.tenantId, id);
  }

  // ── Policies ──────────────────────────────────────────────────────────
  @Get('policies')
  getPolicies(@Request() req) { return this.orgService.getPolicies(req.user.tenantId); }

  @Post('policies')
  createPolicy(@Request() req, @Body() body: any) { return this.orgService.createPolicy(req.user.tenantId, body); }

  @Patch('policies/:id')
  updatePolicy(@Request() req, @Param('id') id: string, @Body() body: any) { return this.orgService.updatePolicy(req.user.tenantId, id, body); }

  @Delete('policies/:id')
  deletePolicy(@Request() req, @Param('id') id: string) { return this.orgService.deletePolicy(req.user.tenantId, id); }

  // ── Meetings ──────────────────────────────────────────────────────────
  @Get('meetings')
  getMeetings(@Request() req) { return this.orgService.getMeetings(req.user.tenantId); }

  @Post('meetings')
  createMeeting(@Request() req, @Body() body: any) { return this.orgService.createMeeting(req.user.tenantId, body); }

  @Patch('meetings/:id')
  updateMeeting(@Request() req, @Param('id') id: string, @Body() body: any) { return this.orgService.updateMeeting(req.user.tenantId, id, body); }

  @Delete('meetings/:id')
  deleteMeeting(@Request() req, @Param('id') id: string) { return this.orgService.deleteMeeting(req.user.tenantId, id); }

  // ── Approvals ─────────────────────────────────────────────────────────
  @Get('approvals')
  getApprovals(@Request() req) { return this.orgService.getApprovals(req.user.tenantId); }

  @Post('approvals')
  createApproval(@Request() req, @Body() body: any) { return this.orgService.createApproval(req.user.tenantId, body); }

  @Patch('approvals/:id')
  updateApproval(@Request() req, @Param('id') id: string, @Body() body: any) { return this.orgService.updateApproval(req.user.tenantId, id, body); }

  @Delete('approvals/:id')
  deleteApproval(@Request() req, @Param('id') id: string) { return this.orgService.deleteApproval(req.user.tenantId, id); }

  // ── Workflows (stub — full implementation in a future sprint) ─────────
  @Get('workflows')
  getWorkflows() { return []; }
}
