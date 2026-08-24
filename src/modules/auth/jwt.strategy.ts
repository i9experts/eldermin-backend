import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: any) {
    return {
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
      resellerId: payload.resellerId,
    };
  }
}
