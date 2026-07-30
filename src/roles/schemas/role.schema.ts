import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoleDocument = Role & Document;

// Matches the resource part of the frontend's Permission type
// ('hr:view' / 'hr:manage', etc.) — keep this list in sync with
// src/types/roles.ts on the frontend if a new module is ever added.
export const ASSIGNABLE_MODULES = [
  { key: 'institution', label: 'Institution Setup' },
  { key: 'governance', label: 'Governance & Compliance' },
  { key: 'documents', label: 'Documents & Workflow' },
  { key: 'hr', label: 'Staff & HR' },
  { key: 'teaching', label: 'Teaching Management' },
  { key: 'finance', label: 'Finance' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'campus', label: 'Campus Operations' },
  { key: 'admissions', label: 'Admissions' },
  { key: 'students', label: 'Student 360' },
  { key: 'academics', label: 'Curriculum Intelligence' },
  { key: 'assessments', label: 'Assessment & Results' },
  { key: 'behaviour', label: 'Behaviour & Tarbiyah' },
  { key: 'analytics', label: 'Analytics & Intelligence' },
  { key: 'apps', label: 'Apps & Modules' },
  { key: 'report-templates', label: 'Report Templates' },
] as const;

export type ModuleAccessLevel = 'none' | 'view' | 'manage';

@Schema({ _id: false })
export class ModuleAccess {
  @Prop({ required: true }) moduleKey: string;
  @Prop({ enum: ['view', 'manage'], required: true }) level: 'view' | 'manage';
}
export const ModuleAccessSchema = SchemaFactory.createForClass(ModuleAccess);

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({ default: '#0C447C' }) color: string;
  // Only modules explicitly listed here are granted — anything not present
  // means no access at all, which is the safe default for a brand-new role.
  @Prop({ type: [ModuleAccessSchema], default: [] })
  moduleAccess: ModuleAccess[];
  // A handful of built-in roles (Teacher, Finance Officer, etc.) ship as
  // read-only starting points — schools can duplicate and customize them,
  // but not edit/delete the originals, so there's always a safe fallback.
  @Prop({ default: false }) isSystemDefault: boolean;
  @Prop() createdBy: string;
}
export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ schoolSlug: 1, name: 1 }, { unique: true });
