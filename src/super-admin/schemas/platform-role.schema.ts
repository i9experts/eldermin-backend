import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformRoleDocument = PlatformRole & Document;

// Platform-level mirror of ASSIGNABLE_MODULES/SUB_MODULES (src/roles/schemas/role.schema.ts),
// scoped to the Super Admin / Company Control Panel's own tabs instead of
// a school's institution-level modules. Keep this list in lockstep with
// TEAM_TABS in the frontend's super-admin/index.tsx (same convention the
// institution-level system already follows for its own modules).
export const ASSIGNABLE_PLATFORM_TABS = [
  { key: 'bi', label: 'Command Center' },
  { key: 'crm', label: 'CRM' },
  { key: 'institutions', label: 'Institutions' },
  { key: 'subscriptions', label: 'Billing & Subscriptions' },
  { key: 'tickets', label: 'Support' },
  { key: 'team', label: 'Team & Access' },
  { key: 'analytics', label: 'Analytics & Reports' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'audit', label: 'Audit & Settings' },
  { key: 'partners', label: 'Partner Network' },
] as const;

// Single-screen tabs for v1 - no meaningful internal sub-division has been
// carved out yet (unlike e.g. Finance's many sub-modules at the
// institution level), so each tab gets exactly one sub-tab matching the
// tab itself. Can be broken down further later without touching any
// already-saved PlatformRole document's meaning (same additive convention
// as SUB_MODULES).
export const SUB_TABS: Record<string, { key: string; label: string }[]> =
  Object.fromEntries(ASSIGNABLE_PLATFORM_TABS.map(t => [t.key, [{ key: t.key, label: t.label }]]));

export type PlatformAccessLevel = 'none' | 'view' | 'manage';

@Schema({ _id: false })
export class PlatformModuleAccess {
  @Prop({ required: true }) tabKey: string;
  @Prop({ enum: ['view', 'manage'], required: true }) level: 'view' | 'manage';
  @Prop({ type: String, default: null }) subTabKey?: string | null;
}
export const PlatformModuleAccessSchema = SchemaFactory.createForClass(PlatformModuleAccess);

@Schema({ timestamps: true, collection: 'platform_roles' })
export class PlatformRole {
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({ default: '#1e3a5f' }) color: string;
  // Only tabs explicitly listed here are granted - anything not present
  // means no access at all, the safe default for a brand-new role.
  @Prop({ type: [PlatformModuleAccessSchema], default: [] })
  moduleAccess: PlatformModuleAccess[];
  // Sales/Support/Onboarding/Finance ship as read-only starting points -
  // i9experts can duplicate and customize them, but not edit/delete the
  // originals, so there's always a safe fallback.
  @Prop({ default: false }) isSystemDefault: boolean;
  @Prop() createdBy: string;
}
export const PlatformRoleSchema = SchemaFactory.createForClass(PlatformRole);
// Platform-wide - no schoolSlug/tenantId scoping exists at this level, so
// unlike Role (unique per schoolSlug+name) this is unique on name alone.
PlatformRoleSchema.index({ name: 1 }, { unique: true });
