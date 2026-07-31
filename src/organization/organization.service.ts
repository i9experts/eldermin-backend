import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  School, SchoolDocument,
  Campus, CampusDocument,
  AcademicYear, AcademicYearDocument,
  Grade, GradeDocument,
  Department, DepartmentDocument,
  Designation, DesignationDocument,
} from './schemas/organization.schema';
import {
  UpdateSchoolDto, CreateCampusDto, CreateAcademicYearDto,
  CreateGradeDto, CreateDepartmentDto, CreateDesignationDto,
  CreateGroupInstitutionDto,
} from './dto/organization.dto';
import { GroupInstitution, GroupInstitutionDocument } from './schemas/group-institution.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(AcademicYear.name) private yearModel: Model<AcademicYearDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(Department.name) private deptModel: Model<DepartmentDocument>,
    @InjectModel(Designation.name) private designModel: Model<DesignationDocument>,
    @InjectModel(GroupInstitution.name) private groupInstitutionModel: Model<GroupInstitutionDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    private uploadService: UploadService,
  ) {}

  // ── School ────────────────────────────────────────────────
  async getSchool(slug: string) {
    let school = await this.schoolModel.findOne({ slug });
    if (!school) {
      school = new this.schoolModel({ slug, name: 'Demo School' });
      await school.save();
    }
    return school;
  }

  async updateSchool(slug: string, dto: UpdateSchoolDto) {
    return this.schoolModel.findOneAndUpdate(
      { slug }, { $set: dto }, { new: true, upsert: true },
    );
  }

  async uploadLogo(slug: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.uploadFile(file, 'institution-logos', slug);
    const school = await this.schoolModel.findOneAndUpdate(
      { slug }, { $set: { logo: url } }, { new: true },
    );
    if (!school) throw new NotFoundException('School not found');
    return { logoUrl: url };
  }

  async getOrganizationOverview(schoolSlug: string) {
    const [school, campuses, currentYear, grades, departments] = await Promise.all([
      this.schoolModel.findOne({ slug: schoolSlug }),
      this.campusModel.countDocuments({ schoolSlug, isActive: true }),
      this.yearModel.findOne({ schoolSlug, isCurrent: true }),
      this.gradeModel.countDocuments({ schoolSlug, isActive: true }),
      this.deptModel.countDocuments({ schoolSlug, isActive: true }),
    ]);
    return { school, campuses, currentYear, grades, departments };
  }

  // ── Campuses ──────────────────────────────────────────────
  async getCampuses(schoolSlug: string) {
    const campuses = await this.campusModel.find({ schoolSlug, isActive: true }).sort({ name: 1 }).lean();
    if (campuses.length === 0) return campuses;

    // Real per-campus counts, not the hardcoded 0 this used to be. Students
    // bulk-imported before multi-campus support existed here have no
    // campusId at all — rather than showing them as belonging nowhere (which
    // would make a single-campus school's real enrollment always read 0,
    // exactly what was reported), they're counted against whichever campus
    // was created first for this school, since that's genuinely where they
    // belong until someone explicitly moves them elsewhere.
    const [countsByCampus, unassignedCount, oldestCampus] = await Promise.all([
      this.studentModel.aggregate([
        { $match: { schoolSlug, status: 'active', campusId: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$campusId', count: { $sum: 1 } } },
      ]),
      this.studentModel.countDocuments({
        schoolSlug, status: 'active',
        $or: [{ campusId: { $exists: false } }, { campusId: null }, { campusId: '' }],
      }),
      this.campusModel.findOne({ schoolSlug, isActive: true }).sort({ createdAt: 1 }).lean(),
    ]);
    const countMap = new Map(countsByCampus.map((c: any) => [String(c._id), c.count]));
    const oldestCampusId = oldestCampus ? String((oldestCampus as any)._id) : null;

    return campuses.map((c: any) => ({
      ...c,
      currentStudentCount: (countMap.get(String(c._id)) || 0) + (String(c._id) === oldestCampusId ? unassignedCount : 0),
    }));
  }

  async createCampus(dto: CreateCampusDto) {
    const campus = new this.campusModel(dto);
    return campus.save();
  }

  async updateCampus(id: string, schoolSlug: string, dto: Partial<CreateCampusDto>) {
    const campus = await this.campusModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!campus) throw new NotFoundException('Campus not found');
    return campus;
  }

  async deleteCampus(id: string, schoolSlug: string) {
    await this.campusModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } });
    return { message: 'Campus deactivated' };
  }

  // ── Academic Years ────────────────────────────────────────
  async getAcademicYears(schoolSlug: string) {
    return this.yearModel.find({ schoolSlug }).sort({ startDate: -1 });
  }

  async createAcademicYear(dto: CreateAcademicYearDto) {
    if (dto.isCurrent) {
      await this.yearModel.updateMany({ schoolSlug: dto.schoolSlug }, { $set: { isCurrent: false } });
    }
    const year = new this.yearModel({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      terms: (dto.terms || []).map(t => ({
        ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate),
      })),
    });
    return year.save();
  }

  async setCurrentYear(id: string, schoolSlug: string) {
    await this.yearModel.updateMany({ schoolSlug }, { $set: { isCurrent: false } });
    return this.yearModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isCurrent: true } }, { new: true });
  }

  // ── Grades ────────────────────────────────────────────────
  async getGrades(schoolSlug: string, campusId?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (campusId) filter.campusId = campusId;
    return this.gradeModel.find(filter).sort({ displayOrder: 1, name: 1 });
  }

  async createGrade(dto: CreateGradeDto) {
    const grade = new this.gradeModel(dto);
    return grade.save();
  }

  async addSection(gradeId: string, schoolSlug: string, section: any) {
    return this.gradeModel.findOneAndUpdate(
      { _id: gradeId, schoolSlug },
      { $push: { sections: section } },
      { new: true },
    );
  }

  async bulkCreateGrades(schoolSlug: string) {
    const defaultGrades = [
      'Pre-Nursery', 'Nursery', 'KG-1', 'KG-2',
      'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
      'Grade 6', 'Grade 7', 'Grade 8',
      'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    ];
    const ops = defaultGrades.map((name, i) => ({
      updateOne: {
        filter: { name, schoolSlug },
        update: { $setOnInsert: { name, displayOrder: i + 1, schoolSlug, isActive: true, sections: [] } },
        upsert: true,
      },
    }));
    await this.gradeModel.bulkWrite(ops);
    return this.gradeModel.find({ schoolSlug }).sort({ displayOrder: 1 });
  }

  // ── Departments ───────────────────────────────────────────
  async getDepartments(schoolSlug: string) {
    return this.deptModel.find({ schoolSlug, isActive: true }).sort({ name: 1 });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const dept = new this.deptModel(dto);
    return dept.save();
  }

  async updateDepartment(id: string, schoolSlug: string, dto: Partial<CreateDepartmentDto>) {
    return this.deptModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
  }

  // ── Designations ──────────────────────────────────────────
  async getDesignations(schoolSlug: string, category?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (category) filter.category = category;
    return this.designModel.find(filter).sort({ name: 1 });
  }

  async createDesignation(dto: CreateDesignationDto) {
    const desig = new this.designModel(dto);
    return desig.save();
  }

  // ── Group Institutions ────────────────────────────────────
  async getGroupInstitutions(schoolSlug: string) {
    const institutions = await this.groupInstitutionModel.find({ schoolSlug }).sort({ createdAt: 1 });
    if (institutions.length > 0) return institutions;

    const school = await this.getSchool(schoolSlug);
    const seeded = new this.groupInstitutionModel({
      schoolSlug,
      name: school.name,
      registrationNumber: school.registrationNumber,
      type: school.type,
      status: school.isActive ? 'Active' : 'Inactive',
      email: school.email,
      phone: school.phone,
      website: school.social?.website,
      address: {
        city: school.address?.city,
        province: school.address?.province,
        country: school.address?.country,
        postalCode: school.address?.postalCode,
      },
    });
    await seeded.save();
    return [seeded];
  }

  async createGroupInstitution(dto: CreateGroupInstitutionDto) {
    const institution = new this.groupInstitutionModel(dto);
    return institution.save();
  }

  async updateGroupInstitution(id: string, schoolSlug: string, dto: Partial<CreateGroupInstitutionDto>) {
    const institution = await this.groupInstitutionModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  async archiveGroupInstitution(id: string, schoolSlug: string) {
    const institution = await this.groupInstitutionModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { status: 'Inactive' } }, { new: true },
    );
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }
}
