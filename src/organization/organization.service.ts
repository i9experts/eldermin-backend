import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  School, SchoolDocument,
  Campus, CampusDocument,
  Cluster, ClusterDocument,
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
import { StudentAttendance, StudentAttendanceDocument, StudentFee, StudentFeeDocument } from '../students/schemas/student-supporting.schema';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';
import { UploadService } from '../upload/upload.service';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileDocument } from '../modules/teaching/schemas/teacher-profile.schema';

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
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    @InjectModel(StudentAttendance.name) private attendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(StudentFee.name) private feeModel: Model<StudentFeeDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
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
  async getCampuses(schoolSlug: string, requestingUser?: ScopedUser) {
    const filter: any = { schoolSlug, isActive: true };
    if (requestingUser) {
      // Campus-/department-scoped roles (everyone except super_admin and
      // institution_owner) only ever see their own campus in this list -
      // no requestedCampusId is passed here since this endpoint has no
      // such query param, so resolveCampusScope just returns their own
      // campusId (or undefined for institution/platform-level callers,
      // meaning no restriction).
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      if (effectiveCampusId) filter._id = effectiveCampusId;
    }
    const campuses = await this.campusModel.find(filter).sort({ name: 1 }).lean();
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

  // ── Cluster (groups multiple Campuses into a supervised region) ──
  // Real, optional entity - most schools never touch this. Exists for
  // large multi-campus networks/trusts (e.g. a 200-campus rural network)
  // that genuinely need a layer above Campus for supervision and
  // regional reporting.
  async getClusters(schoolSlug: string) {
    const clusters = await this.clusterModel.find({ schoolSlug, isActive: true }).sort({ name: 1 }).lean();
    if (clusters.length === 0) return clusters;

    const campusCounts = await this.campusModel.aggregate([
      { $match: { schoolSlug, isActive: true, clusterId: { $ne: null } } },
      { $group: { _id: '$clusterId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(campusCounts.map((c: any) => [String(c._id), c.count]));

    return clusters.map((c: any) => ({ ...c, campusCount: countMap.get(String(c._id)) || 0 }));
  }

  async createCluster(schoolSlug: string, dto: any) {
    const cluster = new this.clusterModel({ ...dto, schoolSlug });
    return cluster.save();
  }

  async updateCluster(id: string, schoolSlug: string, dto: any) {
    const cluster = await this.clusterModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!cluster) throw new NotFoundException('Cluster not found');
    return cluster;
  }

  async deleteCluster(id: string, schoolSlug: string) {
    const inUse = await this.campusModel.countDocuments({ schoolSlug, clusterId: id, isActive: true });
    if (inUse > 0) throw new BadRequestException(`${inUse} campus(es) are still assigned to this cluster - reassign them first`);
    await this.clusterModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } });
    return { message: 'Cluster deactivated' };
  }

  async assignCampusToCluster(campusId: string, schoolSlug: string, clusterId: string | null) {
    const campus = await this.campusModel.findOneAndUpdate(
      { _id: campusId, schoolSlug }, { $set: { clusterId } }, { new: true },
    );
    if (!campus) throw new NotFoundException('Campus not found');
    return campus;
  }

  // Real Cluster/Region aggregate dashboard. Optionally scoped to a
  // specific set of clusterIds (a Supervisor sees only their own
  // cluster(s); Board/Regional sees every real cluster with no filter -
  // that scoping decision is made by the controller/caller, this method
  // just honors whatever cluster list it's given).
  async getClusterDashboard(schoolSlug: string, clusterIds?: string[]) {
    const clusterFilter: any = { schoolSlug, isActive: true };
    if (clusterIds?.length) clusterFilter._id = { $in: clusterIds };
    const clusters = await this.clusterModel.find(clusterFilter).lean();

    const campusFilter: any = { schoolSlug, isActive: true };
    if (clusterIds?.length) campusFilter.clusterId = { $in: clusterIds };
    const campuses = await this.campusModel.find(campusFilter).select('_id name clusterId').lean();
    const campusIds = campuses.map((c: any) => String(c._id));
    const campusToCluster = new Map(campuses.map((c: any) => [String(c._id), c.clusterId ? String(c.clusterId) : null]));

    const [studentCounts, attendanceToday, feeStats] = await Promise.all([
      this.studentModel.aggregate([
        { $match: { schoolSlug, status: 'active', campusId: { $in: campusIds } } },
        { $group: { _id: '$campusId', count: { $sum: 1 } } },
      ]),
      this.attendanceModel.aggregate([
        {
          $match: {
            schoolSlug,
            date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            status: { $in: ['present', 'late', 'half_day'] },
          },
        },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),
      this.feeModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: null, totalDue: { $sum: '$amount' }, totalCollected: { $sum: '$paidAmount' } } },
      ]),
    ]);

    const studentsByCampus = new Map(studentCounts.map((s: any) => [String(s._id), s.count]));

    // Roll student counts up from Campus -> Cluster
    const clusterStats = clusters.map((cl: any) => {
      const clusterCampusIds = campuses.filter((c: any) => String(c.clusterId) === String(cl._id)).map((c: any) => String(c._id));
      const studentCount = clusterCampusIds.reduce((sum, cid) => sum + (studentsByCampus.get(cid) || 0), 0);
      return {
        clusterId: cl._id, name: cl.name, region: cl.region,
        campusCount: clusterCampusIds.length, studentCount,
      };
    });

    const unclusteredCampusIds = campuses.filter((c: any) => !c.clusterId).map((c: any) => String(c._id));
    const unclusteredStudentCount = unclusteredCampusIds.reduce((sum, cid) => sum + (studentsByCampus.get(cid) || 0), 0);

    return {
      totalClusters: clusters.length,
      totalCampuses: campuses.length,
      totalStudents: campusIds.reduce((sum, cid) => sum + (studentsByCampus.get(cid) || 0), 0),
      presentToday: attendanceToday[0]?.count || 0,
      feeCollectionRate: feeStats[0]?.totalDue > 0 ? Math.round((feeStats[0].totalCollected / feeStats[0].totalDue) * 100) : null,
      clusters: clusterStats,
      unclusteredCampuses: unclusteredCampusIds.length > 0 ? { campusCount: unclusteredCampusIds.length, studentCount: unclusteredStudentCount } : null,
    };
  }

  // ── Academic Years ────────────────────────────────────────
  async getAcademicYears(schoolSlug: string, institutionId?: string, campusId?: string) {
    const filter: any = { schoolSlug };
    // Explicit filter narrows to that scope only. With no filter, return
    // every year (school-wide + institution-specific + campus-specific)
    // so existing single-campus schools keep seeing everything they had.
    if (institutionId) filter.institutionId = institutionId;
    if (campusId) filter.campusId = campusId;
    return this.yearModel.find(filter).sort({ startDate: -1 });
  }

  async createAcademicYear(dto: CreateAcademicYearDto) {
    if (dto.isCurrent) {
      await this.yearModel.updateMany({ schoolSlug: dto.schoolSlug }, { $set: { isCurrent: false } });
    }
    const year = new this.yearModel({
      ...dto,
      institutionId: dto.institutionId || null,
      campusId: dto.campusId || null,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      terms: (dto.terms || []).map(t => ({
        ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate),
      })),
    });
    return year.save();
  }

  async updateAcademicYear(id: string, schoolSlug: string, dto: Partial<CreateAcademicYearDto>) {
    const update: any = { ...dto };
    if (dto.startDate) update.startDate = new Date(dto.startDate);
    if (dto.endDate) update.endDate = new Date(dto.endDate);
    if (dto.terms) update.terms = dto.terms.map(t => ({ ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate) }));
    if ('institutionId' in dto) update.institutionId = dto.institutionId || null;
    if ('campusId' in dto) update.campusId = dto.campusId || null;
    const year = await this.yearModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  async deleteAcademicYear(id: string, schoolSlug: string) {
    const year = await this.yearModel.findOne({ _id: id, schoolSlug });
    if (!year) throw new NotFoundException('Academic year not found');
    if (year.isCurrent) throw new BadRequestException('Cannot delete the current academic year — set another year as current first');
    await this.yearModel.deleteOne({ _id: id, schoolSlug });
    return { message: 'Academic year deleted' };
  }

  async setCurrentYear(id: string, schoolSlug: string) {
    await this.yearModel.updateMany({ schoolSlug }, { $set: { isCurrent: false } });
    return this.yearModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isCurrent: true } }, { new: true });
  }

  // ── Grades ────────────────────────────────────────────────
  async getGrades(schoolSlug: string, campusId?: string, requestingUser?: ScopedUser) {
    const filter: any = { schoolSlug, isActive: true };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    return this.gradeModel.find(filter).sort({ displayOrder: 1, name: 1 });
  }

  async createGrade(dto: CreateGradeDto) {
    const grade = new this.gradeModel(dto);
    return grade.save();
  }

  async updateGrade(id: string, schoolSlug: string, dto: Partial<CreateGradeDto>) {
    const grade = await this.gradeModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!grade) throw new NotFoundException('Grade not found');
    return grade;
  }

  async deactivateGrade(id: string, schoolSlug: string) {
    const grade = await this.gradeModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } });
    if (!grade) throw new NotFoundException('Grade not found');
    return { message: 'Grade deactivated' };
  }

  async addSection(gradeId: string, schoolSlug: string, section: any) {
    return this.gradeModel.findOneAndUpdate(
      { _id: gradeId, schoolSlug },
      { $push: { sections: section } },
      { new: true },
    );
  }

  async removeSection(gradeId: string, schoolSlug: string, sectionId: string) {
    const grade = await this.gradeModel.findOneAndUpdate(
      { _id: gradeId, schoolSlug },
      { $pull: { sections: { _id: sectionId } } },
      { new: true },
    );
    if (!grade) throw new NotFoundException('Grade not found');
    return grade;
  }

  /** Assigns a real teacher (by their User id) as the Class Teacher of a
   * specific grade+section. This is the actual foundational piece behind
   * "class teacher" anywhere in the app - previously the schema had the
   * right shape in three separate places (Section.classTeacherId,
   * TeacherProfile.isClassTeacher, Student.classTeacherId) but nothing
   * ever wired them together. This does:
   *  1. Clears the PREVIOUS teacher's isClassTeacher flag, if this
   *     section already had a different one assigned - a teacher should
   *     only ever show as class teacher of the section they're
   *     currently, actually assigned to.
   *  2. Sets classTeacherId/classTeacher on the embedded Section itself
   *     (the real, single source of truth for this assignment).
   *  3. Sets isClassTeacher/classTeacherOfGradeId/classTeacherOfSectionName/
   *     classTeacherOfName on the new teacher's own TeacherProfile -
   *     denormalized for their own dashboard/profile to display directly.
   *  4. Bulk-updates every Student currently in that grade+section with
   *     classTeacher/classTeacherId - denormalized for student lists/
   *     profiles to display without an extra join.
   */
  async assignClassTeacher(
    gradeId: string,
    sectionId: string,
    classTeacherId: string,
    schoolSlug: string,
  ) {
    const grade = await this.gradeModel.findOne({ _id: gradeId, schoolSlug });
    if (!grade) throw new NotFoundException('Grade not found');
    const section = grade.sections.find((s: any) => s._id.toString() === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    const sectionName = section.name;

    const newTeacherStaff = await this.staffModel.findOne({ userId: classTeacherId, schoolSlug }).lean();
    if (!newTeacherStaff) throw new NotFoundException('No staff record found for this user');
    const classTeacherName = `${newTeacherStaff.firstName || ''} ${newTeacherStaff.lastName || ''}`.trim();

    // Step 1: clear the previous teacher's flag, if this section already
    // had someone else assigned and it's actually changing.
    const previousClassTeacherId = (section as any).classTeacherId?.toString();
    if (previousClassTeacherId && previousClassTeacherId !== classTeacherId) {
      const prevStaff = await this.staffModel.findOne({ userId: previousClassTeacherId, schoolSlug }).lean();
      if (prevStaff) {
        await this.teacherProfileModel.updateOne(
          { staffId: prevStaff._id },
          { $set: { isClassTeacher: false, classTeacherOfGradeId: null, classTeacherOfGradeName: null, classTeacherOfSectionName: null, classTeacherOfName: null } },
        );
      }
    }

    // Step 2: set the assignment on the embedded Section itself.
    await this.gradeModel.updateOne(
      { _id: gradeId, schoolSlug, 'sections._id': (section as any)._id },
      { $set: { 'sections.$.classTeacherId': classTeacherId, 'sections.$.classTeacher': classTeacherName } },
    );

    // Step 3: set the new teacher's own TeacherProfile.
    const classTeacherOfName = `${grade.name}${sectionName ? ` - ${sectionName}` : ''}`;
    await this.teacherProfileModel.updateOne(
      { staffId: newTeacherStaff._id },
      { $set: { isClassTeacher: true, classTeacherOfGradeId: gradeId, classTeacherOfGradeName: grade.name, classTeacherOfSectionName: sectionName, classTeacherOfName } },
    );

    // Step 4: denormalize onto every student currently in this class.
    await this.studentModel.updateMany(
      { schoolSlug, currentGrade: grade.name, currentSection: sectionName },
      { $set: { classTeacher: classTeacherName, classTeacherId } },
    );

    return { gradeId, sectionName, classTeacherId, classTeacherName, classTeacherOfName };
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
  async getDepartments(schoolSlug: string, campusId?: string, requestingUser?: ScopedUser) {
    const filter: any = { schoolSlug, isActive: true };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    // campusId: null on a Department means "applies to all campuses" (see
    // the schema comment) — an exact-match filter silently hid those
    // school-wide departments (e.g. central Admin/Finance) the moment a
    // specific campus was selected, even though they apply there too.
    if (effectiveCampusId) {
      filter.$or = [
        { campusId: effectiveCampusId },
        { campusId: null },
        { campusId: { $exists: false } },
      ];
    }
    return this.deptModel.find(filter).sort({ name: 1 });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const dept = new this.deptModel({ ...dto, campusId: dto.campusId || null });
    return dept.save();
  }

  async updateDepartment(id: string, schoolSlug: string, dto: Partial<CreateDepartmentDto>) {
    const update: any = { ...dto };
    if ('campusId' in dto) update.campusId = dto.campusId || null;
    return this.deptModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
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
    const institutions = await this.groupInstitutionModel.find({ schoolSlug }).sort({ createdAt: 1 }).lean();
    let list = institutions;
    if (list.length === 0) {
      const school: any = await this.getSchool(schoolSlug);
      const seeded = new this.groupInstitutionModel({
        schoolSlug,
        name: school.name,
        type: school.type,
        status: school.isActive === false ? 'Inactive' : 'Active',
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
      list = [seeded.toObject()];
    }

    // Real campus counts + real campus principals per institution -
    // previously these two tabs had no relationship at all, so no count
    // or head info was ever possible before. An institution's single
    // "Head" field (typed once on the Institution record) can go stale
    // or simply not match reality once campuses have their own
    // principals assigned, so we surface the real per-campus heads here
    // rather than only showing that one manually-entered name.
    const campuses = await this.campusModel.find(
      { schoolSlug, isActive: true, institutionId: { $ne: null } },
      { name: 1, principalName: 1, institutionId: 1 },
    ).lean();
    const campusesByInstitution = new Map<string, { name: string; principalName?: string }[]>();
    for (const c of campuses as any[]) {
      const key = String(c.institutionId);
      if (!campusesByInstitution.has(key)) campusesByInstitution.set(key, []);
      campusesByInstitution.get(key)!.push({ name: c.name, principalName: c.principalName });
    }

    return list.map((inst: any) => {
      const instCampuses = campusesByInstitution.get(String(inst._id)) || [];
      return {
        ...inst,
        campusCount: instCampuses.length,
        // Real, campus-level heads (one per campus with a principal set) -
        // the source of truth when campuses exist under this institution.
        campusHeads: instCampuses
          .filter((c) => c.principalName)
          .map((c) => ({ campusName: c.name, principalName: c.principalName })),
      };
    });
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
    const inUse = await this.campusModel.countDocuments({ schoolSlug, institutionId: id, isActive: true });
    if (inUse > 0) throw new BadRequestException(`${inUse} campus(es) are still assigned to this institution - reassign them first`);
    const institution = await this.groupInstitutionModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { status: 'Inactive' } }, { new: true },
    );
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  async assignCampusToInstitution(campusId: string, schoolSlug: string, institutionId: string | null) {
    const campus = await this.campusModel.findOneAndUpdate(
      { _id: campusId, schoolSlug }, { $set: { institutionId } }, { new: true },
    );
    if (!campus) throw new NotFoundException('Campus not found');
    return campus;
  }
}
