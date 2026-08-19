import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganizationService } from './organization.service';
import {
  UpdateSchoolDto, CreateCampusDto, CreateAcademicYearDto,
  CreateGradeDto, CreateDepartmentDto, CreateDesignationDto,
  CreateGroupInstitutionDto, CreateClusterDto,
} from './dto/organization.dto';
import { ScopedUser } from '../auth/scope.util';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      supervisedClusterIds: req?.user?.supervisedClusterIds as string[] | undefined,
      isBoardLevel: !!req?.user?.isBoardLevel,
      requestingUser: req?.user as ScopedUser | undefined,
    };
  }

  // School
  @Get('profile') async getProfile(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    const school: any = await this.service.getSchool(schoolSlug);
    const obj = school.toObject ? school.toObject() : school;
    return { ...obj, logoUrl: obj.logo || '' };
  }

  @Get('overview') async getOverview(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getOrganizationOverview(schoolSlug);
  }

  @Put('profile') async updateProfile(@Body() dto: UpdateSchoolDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateSchool(schoolSlug, dto);
  }

  @Post('profile/logo')
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(@UploadedFile() logo: Express.Multer.File, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.uploadLogo(schoolSlug, logo);
  }

  // Campuses
  @Get('campuses') async getCampuses(@Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCampuses(schoolSlug, requestingUser);
  }

  @Post('campuses') @HttpCode(HttpStatus.CREATED)
  async createCampus(@Body() dto: CreateCampusDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCampus({ ...dto, schoolSlug });
  }

  @Put('campuses/:id') async updateCampus(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCampus(id, schoolSlug, dto);
  }

  @Delete('campuses/:id') async deleteCampus(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCampus(id, schoolSlug);
  }

  @Patch('campuses/:id/cluster')
  async assignCampusToCluster(@Param('id') id: string, @Body('clusterId') clusterId: string | null, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.assignCampusToCluster(id, schoolSlug, clusterId);
  }

  // Clusters
  @Get('clusters') async getClusters(@Request() req: any) {
    const { schoolSlug, supervisedClusterIds, isBoardLevel } = this.ctx(req);
    const clusters = await this.service.getClusters(schoolSlug);
    if (!isBoardLevel && supervisedClusterIds?.length) {
      const allowed = new Set(supervisedClusterIds);
      return clusters.filter((c: any) => allowed.has(String(c._id)));
    }
    return clusters;
  }

  @Post('clusters') @HttpCode(HttpStatus.CREATED)
  async createCluster(@Body() dto: CreateClusterDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCluster(schoolSlug, dto);
  }

  @Put('clusters/:id') async updateCluster(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCluster(id, schoolSlug, dto);
  }

  @Delete('clusters/:id') async deleteCluster(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCluster(id, schoolSlug);
  }

  @Get('clusters/dashboard')
  async getClusterDashboard(@Request() req: any, @Query('clusterIds') clusterIds?: string) {
    const { schoolSlug, supervisedClusterIds, isBoardLevel } = this.ctx(req);
    // Explicit query param wins (lets Board/Regional users deliberately
    // narrow the view). Otherwise: a real Supervisor assignment scopes
    // them to only their own cluster(s); Board-level or unassigned staff
    // (the vast majority - this field is empty for almost everyone) see
    // every cluster with no filter at all.
    const effectiveClusterIds = clusterIds
      ? clusterIds.split(',')
      : (!isBoardLevel && supervisedClusterIds?.length ? supervisedClusterIds : undefined);
    return this.service.getClusterDashboard(schoolSlug, effectiveClusterIds);
  }

  // Academic Years
  @Get('academic-years') async getYears(
    @Request() req: any,
    @Query('institutionId') institutionId?: string,
    @Query('campusId') campusId?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAcademicYears(schoolSlug, institutionId, campusId);
  }

  @Post('academic-years') @HttpCode(HttpStatus.CREATED)
  async createYear(@Body() dto: CreateAcademicYearDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createAcademicYear({ ...dto, schoolSlug });
  }

  @Put('academic-years/:id') async updateYear(@Param('id') id: string, @Body() dto: Partial<CreateAcademicYearDto>, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateAcademicYear(id, schoolSlug, dto);
  }

  @Delete('academic-years/:id') async deleteYear(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteAcademicYear(id, schoolSlug);
  }

  @Patch('academic-years/:id/set-current')
  async setCurrentYear(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setCurrentYear(id, schoolSlug);
  }

  // Grades
  @Get('grades') async getGrades(@Request() req: any, @Query('campusId') campusId?: string) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getGrades(schoolSlug, campusId, requestingUser);
  }

  @Post('grades') @HttpCode(HttpStatus.CREATED)
  async createGrade(@Body() dto: CreateGradeDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createGrade({ ...dto, schoolSlug });
  }

  @Put('grades/:id') async updateGrade(@Param('id') id: string, @Body() dto: Partial<CreateGradeDto>, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateGrade(id, schoolSlug, dto);
  }

  @Delete('grades/:id') async deleteGrade(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deactivateGrade(id, schoolSlug);
  }

  @Post('grades/seed') async seedGrades(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.bulkCreateGrades(schoolSlug);
  }

  @Post('grades/:id/sections')
  async addSection(@Param('id') id: string, @Body() section: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.addSection(id, schoolSlug, section);
  }

  @Delete('grades/:id/sections/:sectionId')
  async removeSection(@Param('id') id: string, @Param('sectionId') sectionId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.removeSection(id, schoolSlug, sectionId);
  }

  @Patch('grades/:id/sections/:sectionId/class-teacher')
  async assignClassTeacher(
    @Param('id') gradeId: string,
    @Param('sectionId') sectionId: string,
    @Body('classTeacherId') classTeacherId: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.assignClassTeacher(gradeId, sectionId, classTeacherId, schoolSlug);
  }

  // Departments
  @Get('departments') async getDepts(@Request() req: any, @Query('campusId') campusId?: string) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getDepartments(schoolSlug, campusId, requestingUser);
  }

  @Post('departments') @HttpCode(HttpStatus.CREATED)
  async createDept(@Body() dto: CreateDepartmentDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createDepartment({ ...dto, schoolSlug });
  }

  @Put('departments/:id') async updateDept(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateDepartment(id, schoolSlug, dto);
  }

  // Designations
  @Get('designations') async getDesignations(@Request() req: any, @Query('category') cat?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDesignations(schoolSlug, cat);
  }

  @Post('designations') @HttpCode(HttpStatus.CREATED)
  async createDesignation(@Body() dto: CreateDesignationDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createDesignation({ ...dto, schoolSlug });
  }

  // Group Institutions
  @Get('institutions') async getInstitutions(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGroupInstitutions(schoolSlug);
  }

  @Post('institutions') @HttpCode(HttpStatus.CREATED)
  async createInstitution(@Body() dto: CreateGroupInstitutionDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createGroupInstitution({ ...dto, schoolSlug });
  }

  @Put('institutions/:id')
  async updateInstitutionRecord(@Param('id') id: string, @Body() dto: Partial<CreateGroupInstitutionDto>, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateGroupInstitution(id, schoolSlug, dto);
  }

  @Delete('institutions/:id')
  async archiveInstitutionRecord(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.archiveGroupInstitution(id, schoolSlug);
  }

  @Patch('campuses/:id/institution')
  async assignCampusToInstitution(@Param('id') id: string, @Body('institutionId') institutionId: string | null, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.assignCampusToInstitution(id, schoolSlug, institutionId);
  }
}
