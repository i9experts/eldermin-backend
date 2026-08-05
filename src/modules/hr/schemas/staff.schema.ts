import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StaffDocument = Staff & Document;

@Schema({ timestamps: true, collection: 'staff' })
export class Staff {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campus' })
  campusId: Types.ObjectId;

  @Prop({ required: true })
  employeeId: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop({ enum: ['male', 'female', 'other'] })
  gender: string;

  @Prop()
  dateOfBirth: Date;

  @Prop()
  dateOfJoining: Date;

  @Prop({ type: Types.ObjectId, ref: 'Designation' })
  designationId: Types.ObjectId;

  @Prop()
  designation: string;

  @Prop()
  campus: string;

  @Prop()
  erpRole: string;

  // Links to the real login-capable User account, once one has been
  // created for this staff member — most staff added via HR (manually or
  // via bulk import) don't get one automatically, so this stays null until
  // someone explicitly provisions a login for them.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  @Prop()
  department: string;

  @Prop({
    enum: ['full_time', 'part_time', 'contract', 'visiting', 'intern', 'substitute', 'volunteer'],
    default: 'full_time',
  })
  employmentType: string;

  @Prop({ default: 0 })
  salary: number;

  @Prop({ default: 'PKR' })
  salaryCurrency: string;

  // Structured breakdown built from this school's own configured Salary
  // Components — this is what payroll processing actually reads per
  // employee, instead of every employee showing the same hardcoded
  // Basic/HRA/Transport/Medical figures regardless of role or seniority.
  @Prop({
    type: [{
      componentId: { type: Types.ObjectId, ref: 'SalaryComponent' },
      code: String,
      name: String,
      type: { type: String, enum: ['earning', 'deduction'] },
      amount: Number,
    }],
    default: [],
  })
  salaryStructure: { componentId: Types.ObjectId; code: string; name: string; type: string; amount: number }[];

  @Prop()
  avatarUrl: string;

  @Prop({
    type: { street: String, city: String, state: String, country: String, postalCode: String },
    default: {},
  })
  address: Record<string, any>;

  @Prop({
    enum: ['active', 'on_leave', 'resigned', 'terminated', 'probation', 'suspended'],
    default: 'active',
  })
  status: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: {
      title: String, middleName: String, preferredName: String, arabicName: String,
      placeOfBirth: String, maritalStatus: String, nationality: String, secondNationality: String,
      religion: String, bloodGroup: String, motherTongue: String, languagesSpoken: String,
    },
  })
  personal: Record<string, any>;

  @Prop({
    type: {
      nationalId: { no: String, expiry: Date },
      passport: { no: String, expiry: Date },
      visa: { no: String, expiry: Date },
      residencePermit: { no: String, expiry: Date },
      teachingLicense: { no: String, expiry: Date, authority: String, country: String },
    },
  })
  identityDocs: Record<string, any>;

  @Prop({
    type: {
      personalPhone: String, workPhone: String, whatsApp: String, altPhone: String, workEmail: String,
      preferredContact: String,
      currentAddress: { street: String, city: String, state: String, country: String, postalCode: String },
      permanentAddress: { street: String, city: String, state: String, country: String, postalCode: String },
      emergency: { name: String, relation: String, phone: String, altPhone: String },
    },
  })
  contact: Record<string, any>;

  @Prop({
    type: {
      reportingTo: String, probationEndDate: Date, contractType: String, contractEndDate: Date,
      workingHoursPerWeek: Number, noticePeriodDays: Number, createPortalAccount: Boolean,
    },
  })
  employment: Record<string, any>;

  @Prop({
    type: {
      subjectsCanTeach: [String], gradeLevelsCanTeach: [String],
      maxPeriodsPerDay: Number, maxPeriodsPerWeek: Number, isClassTeacher: Boolean, specializations: String,
      certifications: { cambridge: Boolean, ib: Boolean, google: Boolean, microsoft: Boolean, sen: Boolean, ece: Boolean },
    },
  })
  teacherProfile: Record<string, any>;

  @Prop({
    type: [{ degree: String, field: String, institution: String, country: String, year: String, grade: String, specialization: String }],
    default: [],
  })
  qualifications: Record<string, any>[];

  @Prop({
    type: [{ name: String, issuedBy: String, issueDate: Date, expiryDate: Date }],
    default: [],
  })
  certifications: Record<string, any>[];

  @Prop({
    type: [{ employer: String, jobTitle: String, fromDate: Date, toDate: Date, reason: String }],
    default: [],
  })
  experience: Record<string, any>[];

  @Prop({
    type: [{ name: String, title: String, organization: String, phone: String, email: String }],
    default: [],
  })
  references: Record<string, any>[];

  @Prop({
    type: {
      bankName: String, accountTitle: String, accountNo: String, iban: String,
      branchCode: String, branchName: String, currency: String, isVerified: Boolean,
    },
  })
  bankDetails: Record<string, any>;

  @Prop({
    type: [{
      label: String, url: String, key: String, fileName: String,
      fileSize: Number, fileType: String, verified: { type: Boolean, default: false },
      uploadedAt: { type: Date, default: Date.now },
    }],
    default: [],
  })
  documents: Record<string, any>[];
}

export const StaffSchema = SchemaFactory.createForClass(Staff);
StaffSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
StaffSchema.index({ tenantId: 1, email: 1 }, { sparse: true });
