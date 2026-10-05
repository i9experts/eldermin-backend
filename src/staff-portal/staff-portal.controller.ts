import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { StaffPortalService } from './staff-portal.service';
import { StaffTeachingService } from './staff-teaching.service';
import {
  AccountDeleteRequestDto, CreateStaffThreadDto, RegisterDeviceTokenDto,
  RemoveDeviceTokenDto, ReviewStudentLeaveDto, SendThreadMessageDto,
} from './dto/staff-portal.dto';

/**
 * Staff-facing API for the Eldermin Teacher app. Every handler works only on
 * the caller's own data (identity comes from the JWT, never from the body).
 * Role list = every school-staff role, so coordinators etc. can be enabled in
 * the app later without a backend change; parent/student/reseller roles are
 * excluded, and each handler additionally requires a linked Staff record.
 */
@Roles(
  UserRole.TEACHER, UserRole.ACADEMIC_COORDINATOR, UserRole.VICE_PRINCIPAL, UserRole.PRINCIPAL,
  UserRole.ADMIN, UserRole.INSTITUTION_OWNER, UserRole.HR_MANAGER, UserRole.FINANCE_MANAGER,
  UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF,
)
@Controller('staff-portal')
export class StaffPortalController {
  constructor(
    private readonly service: StaffPortalService,
    private readonly teaching: StaffTeachingService,
  ) {}

  @Get('me')
  getMe(@Request() req: any) { return this.service.getMe(req.user); }

  // Notifications
  @Get('notifications')
  listNotifications(@Request() req: any, @Query() q: any) { return this.service.listNotifications(req.user, q); }

  @Get('notifications/unread-count')
  async unreadCount(@Request() req: any) { return { unreadCount: await this.service.unreadCount(req.user) }; }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@Request() req: any) { return this.service.markAllNotificationsRead(req.user); }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  readOne(@Request() req: any, @Param('id') id: string) { return this.service.markNotificationRead(req.user, id); }

  // Messaging
  @Get('threads')
  listThreads(@Request() req: any, @Query() q: any) { return this.service.listThreads(req.user, q); }

  @Post('threads')
  @HttpCode(HttpStatus.CREATED)
  createThread(@Request() req: any, @Body() dto: CreateStaffThreadDto) { return this.service.createThread(req.user, dto); }

  @Get('threads/:id/messages')
  threadMessages(@Request() req: any, @Param('id') id: string) { return this.service.getThreadMessages(req.user, id); }

  @Post('threads/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(@Request() req: any, @Param('id') id: string, @Body() dto: SendThreadMessageDto) {
    return this.service.sendMessage(req.user, id, dto);
  }

  @Post('threads/:id/read')
  @HttpCode(HttpStatus.OK)
  readThread(@Request() req: any, @Param('id') id: string) { return this.service.markThreadRead(req.user, id); }

  @Patch('threads/:id/close')
  closeThread(@Request() req: any, @Param('id') id: string) { return this.service.closeThread(req.user, id); }

  @Get('students/:studentId/guardians')
  studentGuardians(@Request() req: any, @Param('studentId') studentId: string) {
    return this.service.listStudentGuardians(req.user, studentId);
  }

  // Student leave review (class teacher)
  @Get('student-leaves')
  listStudentLeaves(@Request() req: any, @Query() q: any) { return this.service.listStudentLeaves(req.user, q); }

  @Patch('student-leaves/:id')
  reviewStudentLeave(@Request() req: any, @Param('id') id: string, @Body() dto: ReviewStudentLeaveDto) {
    return this.service.reviewStudentLeave(req.user, id, dto);
  }

  // Homework to grade (own assignments)
  @Get('homework/pending-grading')
  pendingGrading(@Request() req: any, @Query() q: any) { return this.teaching.pendingGrading(req.user, q); }

  // Own timetable slots (date or range)
  @Get('timetable')
  timetable(@Request() req: any, @Query() q: any) { return this.teaching.timetable(req.user, q); }

  // Device token
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  registerToken(@Request() req: any, @Body() dto: RegisterDeviceTokenDto) { return this.service.registerDeviceToken(req.user, dto); }

  @Delete('device-token')
  removeToken(@Request() req: any, @Body() dto: RemoveDeviceTokenDto) { return this.service.removeDeviceToken(req.user, dto.token); }

  // Account deletion request
  @Post('account/delete-request')
  @HttpCode(HttpStatus.CREATED)
  deleteRequest(@Request() req: any, @Body() dto: AccountDeleteRequestDto) { return this.service.requestAccountDeletion(req.user, dto); }
}
