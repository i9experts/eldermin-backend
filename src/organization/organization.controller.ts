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
  CreateGroupInstitutionDto,
} from './dto/organization.dto';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
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
    const { schoolSlug } = this.ctx(req);
    return this.service.getCampuses(schoolSlug);
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

  // Academic Years
  @Get('academic-years') async getYears(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAcademicYears(schoolSlug);
  }

  @Post('academic-years') @HttpCode(HttpStatus.CREATED)
  async createYear(@Body() dto: CreateAcademicYearDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createAcademicYear({ ...dto, schoolSlug });
  }

  @Patch('academic-years/:id/set-current')
  async setCurrentYear(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setCurrentYear(id, schoolSlug);
  }

  // Grades
  @Get('grades') async getGrades(@Request() req: any, @Query('campusId') campusId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGrades(schoolSlug, campusId);
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

  // Departments
  @Get('departments') async getDepts(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDepartments(schoolSlug);
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
}
