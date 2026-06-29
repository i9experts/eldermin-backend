import { Controller, Post, Body, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async sendTest(@Body() dto: { to: string }, @Request() req: any) {
    const result = await this.emailService.sendEmail({
      to: dto.to,
      subject: '✅ Eldermin Email Test',
      html: '<p>Email is working! Eldermin ERP notifications are configured.</p>',
    });
    return { success: result };
  }

  @Post('fee-reminder')
  async feeReminder(@Body() dto: any) {
    return this.emailService.sendFeeReminder(
      dto.to, dto.parentName, dto.studentName,
      dto.grade, dto.amount, dto.dueDate,
      dto.schoolName, dto.invoiceNumber,
    );
  }

  @Post('admission-update')
  async admissionUpdate(@Body() dto: any) {
    return this.emailService.sendAdmissionUpdate(
      dto.to, dto.parentName, dto.studentName,
      dto.status, dto.schoolName, dto.additionalInfo,
    );
  }

  @Post('behaviour-alert')
  async behaviourAlert(@Body() dto: any) {
    return this.emailService.sendBehaviourAlert(
      dto.to, dto.parentName, dto.studentName,
      dto.incidentTitle, dto.description,
      dto.severity, dto.date, dto.schoolName,
    );
  }

  @Post('assessment-results')
  async assessmentResults(@Body() dto: any) {
    return this.emailService.sendAssessmentResults(
      dto.to, dto.parentName, dto.studentName,
      dto.assessmentName, dto.percentage,
      dto.grade, dto.schoolName,
    );
  }

  @Post('tarbiyah-report')
  async tarbiyahReport(@Body() dto: any) {
    return this.emailService.sendTarbiyahReport(
      dto.to, dto.parentName, dto.studentName,
      dto.overallScore, dto.rating, dto.period, dto.schoolName,
    );
  }
}
