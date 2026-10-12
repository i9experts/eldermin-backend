import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CreateSafeguardingManagerDto, CreateSafeguardingReportDto } from './dto/safeguarding.dto';

function messages(errors: ValidationError[]): string[] {
  const out: string[] = [];
  for (const e of errors) {
    if (e.constraints) out.push(...Object.values(e.constraints));
    if (e.children?.length) out.push(...messages(e.children));
  }
  return out;
}

/**
 * Validates and builds the data for POST /compliance/safeguarding.
 *
 * - Reporter caller (role teacher without safeguarding:write; decided by the controller): only the reporter fields
 *   are accepted; any other key (status, assignedTo, confidential, caseNumber,
 *   policeInvolved, reportedBy, campusId, ...) -> 400 (forbidNonWhitelisted).
 *   Reporter identity (reportedBy name, reportedById) comes from the token.
 * - Any other caller (leads and every other role, unchanged): the same required/typed core is
 *   validated (bad body -> 400 instead of a Mongoose 500) but additional
 *   lead fields pass through exactly as before (reportedBy may be supplied).
 */
export function buildSafeguardingCreateData(
  body: any,
  user: { userId?: string; name?: string } | undefined,
  schoolSlug: string,
  fallbackName: string,
  canManage: boolean,
): any {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('A request body is required');
  }
  const cls = canManage ? CreateSafeguardingManagerDto : CreateSafeguardingReportDto;
  const inst = plainToInstance(cls, body);
  const errors = validateSync(inst as object, {
    whitelist: !canManage,
    forbidNonWhitelisted: !canManage,
  });
  if (errors.length) throw new BadRequestException(messages(errors));
  const name = user?.name || fallbackName;
  if (canManage) {
    return {
      ...body,
      schoolSlug,
      reportedBy: body.reportedBy || name,
      ...(user?.userId ? { reportedById: user.userId } : {}),
    };
  }
  const { title, description, type, severity, reportedDate, actionsTaken, studentId, studentName, studentGrade } = inst as any;
  const data: any = { title, description, type, schoolSlug, reportedBy: name };
  if (severity !== undefined) data.severity = severity;
  if (reportedDate !== undefined) data.reportedDate = reportedDate;
  if (actionsTaken !== undefined) data.actionsTaken = actionsTaken;
  if (studentId !== undefined) data.studentId = studentId;
  if (studentName !== undefined) data.studentName = studentName;
  if (studentGrade !== undefined) data.studentGrade = studentGrade;
  if (user?.userId) data.reportedById = user.userId;
  return data;
}
