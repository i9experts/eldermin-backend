// ============================================================
// ORGANIZATION SCHEMAS — Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// SCHOOL PROFILE
// ============================================================
export type SchoolDocument = School & Document;

@Schema({ _id: false })
class Address {
  @Prop() street: string;
  @Prop() city: string;
  @Prop() province: string;
  @Prop() country: string;
  @Prop() postalCode: string;
}

@Schema({ _id: false })
class SocialLinks {
  @Prop() website: string;
  @Prop() facebook: string;
  @Prop() twitter: string;
  @Prop() instagram: string;
  @Prop() youtube: string;
}

@Schema({ timestamps: true, collection: 'schools' })
export class School {
  @Prop({ required: true, unique: true }) slug: string;
  @Prop({ type: [String], default: ["organization"] }) activeModules: string[];
  @Prop({ required: true }) name: string;
  @Prop() nameUrdu: string;
  @Prop() nameArabic: string;
  @Prop() logo: string;
  @Prop() coverImage: string;
  @Prop() motto: string;
  @Prop() description: string;

  @Prop({
    enum: ['school','college','university','madrassa','institute','tutoring_center'],
    default: 'school',
  })
  type: string;

  @Prop({
    enum: ['cambridge','matric','o_levels','a_levels','american','ib','mixed'],
    default: 'matric',
  })
  curriculum: string;

  @Prop() phone: string;
  @Prop() alternatePhone: string;
  @Prop({ lowercase: true, trim: true }) email: string;
  @Prop() fax: string;

  @Prop({ type: Address, default: {} }) address: Address;
  @Prop({ type: SocialLinks, default: {} }) social: SocialLinks;
  @Prop() academicSystem: string; // e.g. cambridge, matric, o_levels, american, ib
  @Prop({ type: Object }) documentRequirements: any; // from onboarding step 7, not yet a full document-type management system

  @Prop() registrationNumber: string;
  @Prop() taxNumber: string;
  @Prop() affiliationBoard: string;
  @Prop() affiliationNumber: string;
  @Prop() establishedYear: number;

  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ default: 'Asia/Karachi' }) timezone: string;
  @Prop({ default: 'en' }) language: string;
  @Prop({ default: 'Urdu' }) mediumOfInstruction: string;

  // Academic settings
  @Prop({ default: 3 }) termsPerYear: number;
  @Prop({
    enum: ['april','august','september','january'],
    default: 'april',
  })
  academicYearStart: string;

  // Features enabled
  @Prop({ default: true }) multiCampus: boolean;
  @Prop({ default: false }) hostelEnabled: boolean;
  @Prop({ default: false }) transportEnabled: boolean;
  @Prop({ default: true }) onlineAdmissions: boolean;

  @Prop({ default: true }) isActive: boolean;
}

export const SchoolSchema = SchemaFactory.createForClass(School);

// ============================================================
// CAMPUS
// ============================================================
export type CampusDocument = Campus & Document;

@Schema({ timestamps: true, collection: 'campuses' })
export class Campus {
  @Prop({ required: true }) name: string;
  @Prop() code: string;
  @Prop() description: string;
  @Prop() type: string; // Main Campus / Branch Campus / Virtual Campus / Satellite Campus
  @Prop() phone: string;
  @Prop() email: string;
  @Prop() address: string;
  @Prop() city: string;
  @Prop() mapLink: string;
  @Prop() principalName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) principalId: Types.ObjectId;
  @Prop() establishedYear: number;
  @Prop() capacity: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
  // Optional - most schools have zero or one cluster and never touch
  // this. Real value only for multi-campus networks/trusts grouping
  // many campuses into supervised regions (e.g. a 200-campus rural
  // network where Supervisors oversee one cluster each).
  @Prop({ type: Types.ObjectId, ref: 'Cluster', default: null }) clusterId: Types.ObjectId | null;
  // Optional - links this campus to a legal/corporate entity
  // (GroupInstitution) for schools/trusts that operate multiple
  // separately-branded institutions. Previously the "Institutions" and
  // "Campuses" tabs were structurally disconnected - adding an
  // Institution record did nothing to any campus - this is the real fix.
  @Prop({ type: Types.ObjectId, ref: 'GroupInstitution', default: null }) institutionId: Types.ObjectId | null;
}

export const CampusSchema = SchemaFactory.createForClass(Campus);
CampusSchema.index({ schoolSlug: 1, isActive: 1 });
CampusSchema.index({ schoolSlug: 1, clusterId: 1 });
CampusSchema.index({ schoolSlug: 1, institutionId: 1 });

// ============================================================
// CLUSTER — groups multiple campuses into a supervised region.
// Real, schoolSlug-scoped entity (matching Campus's own convention,
// since a Cluster directly groups Campuses) - most single-campus or
// small multi-campus schools will never create one; this exists for
// large networks/trusts that genuinely need a layer above Campus.
// ============================================================
export type ClusterDocument = Cluster & Document;

@Schema({ timestamps: true, collection: 'clusters' })
export class Cluster {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string; // e.g. "Multan North Cluster"
  @Prop() region: string; // e.g. "Punjab - South"
  @Prop() description: string;
  @Prop({ default: true }) isActive: boolean;
}

export const ClusterSchema = SchemaFactory.createForClass(Cluster);
ClusterSchema.index({ schoolSlug: 1, isActive: 1 });

// ============================================================
// ACADEMIC YEAR
// ============================================================
export type AcademicYearDocument = AcademicYear & Document;

@Schema({ _id: true })
class Term {
  @Prop({ required: true }) name: string; // Term 1, Term 2, Term 3
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ default: false }) isCurrent: boolean;
}
const TermSchema = SchemaFactory.createForClass(Term);

@Schema({ timestamps: true, collection: 'academic_years' })
export class AcademicYear {
  @Prop({ required: true }) name: string; // e.g. "2025-26"
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ type: [TermSchema], default: [] }) terms: Term[];
  @Prop({ default: false }) isCurrent: boolean;
  @Prop() totalWorkingDays: number;
  @Prop() remarks: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
  // Optional scope narrowing — mirrors Campus.institutionId / Grade.campusId.
  // Left null/undefined means the year applies school-wide (all
  // institutions / all campuses), which is the default and what most
  // single-campus schools will use. Stored as a plain string id (not an
  // ObjectId ref) to match Grade.campusId's proven pattern.
  @Prop({ type: String, default: null }) institutionId: string | null;
  @Prop({ type: String, default: null }) campusId: string | null;
}

export const AcademicYearSchema = SchemaFactory.createForClass(AcademicYear);
AcademicYearSchema.index({ schoolSlug: 1, isCurrent: 1 });
AcademicYearSchema.index({ schoolSlug: 1, institutionId: 1 });
AcademicYearSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// GRADE & SECTION
// ============================================================
export type GradeDocument = Grade & Document;

@Schema({ _id: true })
class Section {
  @Prop({ required: true }) name: string; // A, B, C
  @Prop() capacity: number;
  @Prop() classTeacher: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) classTeacherId: Types.ObjectId;
  @Prop({ default: true }) isActive: boolean;
}
const SectionSchema = SchemaFactory.createForClass(Section);

@Schema({ timestamps: true, collection: 'grades' })
export class Grade {
  @Prop({ required: true }) name: string; // Grade 1, Grade 2 etc.
  @Prop() code: string;
  @Prop() wing: string; // e.g. Montessori, Primary, Secondary, O-Level
  @Prop() displayOrder: number;
  @Prop({ type: [SectionSchema], default: [] }) sections: Section[];
  @Prop() campusId: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);
GradeSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// DEPARTMENT
// ============================================================
export type DepartmentDocument = Department & Document;

@Schema({ timestamps: true, collection: 'departments' })
export class Department {
  @Prop({ required: true }) name: string;
  @Prop() code: string;
  @Prop() description: string;
  @Prop() head: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) headId: Types.ObjectId;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

// ============================================================
// DESIGNATION / POSITION
// ============================================================
export type DesignationDocument = Designation & Document;

@Schema({ timestamps: true, collection: 'designations' })
export class Designation {
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop() departmentId: string;
  @Prop({ enum: ['teaching', 'non_teaching', 'admin', 'management'] }) category: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const DesignationSchema = SchemaFactory.createForClass(Designation);
