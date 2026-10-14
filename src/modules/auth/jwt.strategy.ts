import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthStateService } from './auth-state.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly authState: AuthStateService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: any) {
    // S3: user must exist, be active and carry the current tokenVersion (cached <= 30 s, 503 on DB failure)
    await this.authState.assertTokenValid(payload);
    return {
      tv: payload.tv,
      userId: payload.sub,
      tenantId: payload.tenantId,
      institutionId: payload.institutionId,
      role: payload.role,
      name: payload.name,
      schoolSlug: payload.schoolSlug,
      activeModules: payload.activeModules || [],
      campusId: payload.campusId,
      department: payload.department,
      guardianOfStudentIds: payload.guardianOfStudentIds,
      linkedStudentId: payload.linkedStudentId,
      supervisedClusterIds: payload.supervisedClusterIds,
      isBoardLevel: payload.isBoardLevel || false,
      classTeacherOfGradeId: payload.classTeacherOfGradeId,
      classTeacherOfGradeName: payload.classTeacherOfGradeName,
      classTeacherOfSectionName: payload.classTeacherOfSectionName,
      subjectsCanTeach: payload.subjectsCanTeach,
      gradeLevelsCanTeach: payload.gradeLevelsCanTeach,
      staffId: payload.staffId,
      teacherProfileId: payload.teacherProfileId,
      resellerId: payload.resellerId,
    };
  }
}
