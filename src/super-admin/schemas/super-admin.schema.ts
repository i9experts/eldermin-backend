// ============================================================
// SUPER ADMIN SCHEMAS — Eldermin SaaS Platform
// NestJS + MongoDB | Multi-tenant Management
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// SUBSCRIPTION PLAN CONFIG (platform-level)
// ============================================================
export const SUBSCRIPTION_PLANS = {
  free_trial: {
    name: 'Free Trial',
    price: 0,
    maxStudents: 100,
    maxStaff: 10,
    maxCampuses: 1,
    trialDays: 14,
    features: ['admissions', 'students', 'attendance'],
  },
  starter: {
    name: 'Starter',
    price: 4999,  // PKR per month
    maxStudents: 500,
    maxStaff: 50,
    maxCampuses: 1,
    trialDays: 0,
    features: ['admissions', 'students', 'attendance', 'finance', 'hr', 'documents'],
  },
  professional: {
    name: 'Professional',
    price: 12999,
    maxStudents: 2000,
    maxStaff: 200,
    maxCampuses: 3,
    trialDays: 0,
    features: ['all'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 29999,
    maxStudents: -1, // unlimited
    maxStaff: -1,
    maxCampuses: -1,
    trialDays: 0,
    features: ['all', 'custom_branding', 'dedicated_support', 'sla'],
  },
};

// ============================================================
// INSTITUTION (Tenant) SCHEMA
// ============================================================
export type InstitutionDocument = Institution & Document;

@Schema({ _id: true })
class ContactPerson {
  @Prop() name: string;
  @Prop() email: string;
  @Prop() phone: string;
  @Prop() role: string; // Principal, IT Admin, Owner
}

@Schema({ _id: false })
class UsageSnapshot {
  @Prop({ default: 0 }) totalStudents: number;
  @Prop({ default: 0 }) activeStudents: number;
  @Prop({ default: 0 }) totalStaff: number;
  @Prop({ default: 0 }) totalParents: number;
  @Prop({ default: 0 }) campusCount: number;
  @Prop({ default: 0 }) totalAdmissions: number;
  @Prop({ default: 0 }) totalAssessments: number;
  @Prop({ default: 0 }) totalDocuments: number;
  @Prop() lastUpdated: Date;
}

@Schema({ timestamps: true, collection: 'platform_institutions' })
export class Institution {
  // Identity
  @Prop({ required: true, unique: true, index: true }) slug: string;
  @Prop({ required: true }) name: string;
  @Prop() nameUrdu: string;
  @Prop() logo: string;
  @Prop() type: string; // school, college, madrassa, etc.
  @Prop() curriculum: string;
  @Prop() country: string;
  @Prop() city: string;
  @Prop() address: string;
  @Prop() phone: string;
  @Prop({ lowercase: true }) email: string;
  @Prop() website: string;

  // Primary Contact
  @Prop({ type: ContactPerson }) primaryContact: ContactPerson;
  @Prop({ type: [ContactPerson], default: [] }) contacts: ContactPerson[];

  // Status
  @Prop({
    enum: ['trial', 'active', 'suspended', 'churned', 'pending_setup'],
    default: 'trial',
    index: true,
  })
  status: string;

  @Prop() suspendedReason: string;
  @Prop() suspendedAt: Date;
  @Prop() churnedAt: Date;
  @Prop() churnedReason: string;

  // Subscription
  @Prop({
    enum: ['free_trial', 'starter', 'professional', 'enterprise'],
    default: 'free_trial',
  })
  plan: string;

  @Prop() trialStartDate: Date;
  @Prop() trialEndDate: Date;
  @Prop() subscriptionStartDate: Date;
  @Prop() subscriptionEndDate: Date;
  @Prop({ default: false }) autoRenew: boolean;
  @Prop({ default: 0 }) monthlyRevenue: number; // PKR
  @Prop() billingCycle: string; // monthly, quarterly, annual

  // Activity Tracking
  @Prop() lastLoginAt: Date;
  @Prop() lastActivityAt: Date;
  @Prop() lastDataEntryAt: Date;
  @Prop() setupCompletedAt: Date;
  @Prop({ default: false }) setupCompleted: boolean;
  @Prop({ default: 0 }) loginCount: number;
  @Prop({ default: 0 }) dailyActiveUsers: number;

  // Health Score (0-100)
  @Prop({ default: 0 }) healthScore: number;
  @Prop({ default: false }) isAtChurnRisk: boolean;
  @Prop() churnRiskReason: string;

  // Modules Enabled
  @Prop({ type: [String], default: [] }) enabledModules: string[];

  // Usage Snapshot (updated periodically)
  @Prop({ type: UsageSnapshot, default: {} }) usage: UsageSnapshot;

  // Feature Adoption
  @Prop({
    type: Object,
    default: {},
  })
  featureAdoption: Record<string, boolean>; // { admissions: true, finance: false }

  // Support
  @Prop({ default: 0 }) openSupportTickets: number;
  @Prop() assignedTo: string; // Eldermin support staff
  @Prop() notes: string; // Internal notes

  // Onboarding
  @Prop({ default: 0 }) onboardingStep: number; // 0-8
  @Prop({ default: false }) onboardingCompleted: boolean;

  // Referral
  @Prop() referredBy: string;
  @Prop() campaignSource: string;
}

export const InstitutionSchema = SchemaFactory.createForClass(Institution);
InstitutionSchema.index({ status: 1, plan: 1 });
InstitutionSchema.index({ trialEndDate: 1 });
InstitutionSchema.index({ subscriptionEndDate: 1 });
InstitutionSchema.index({ lastActivityAt: 1 });
InstitutionSchema.index({ city: 1, country: 1 });

// ============================================================
// SUBSCRIPTION HISTORY
// ============================================================
export type SubscriptionHistoryDocument = SubscriptionHistory & Document;

@Schema({ timestamps: true, collection: 'subscription_history' })
export class SubscriptionHistory {
  @Prop({ required: true, index: true }) institutionSlug: string;
  @Prop({ required: true }) institutionName: string;

  @Prop({
    enum: ['new_subscription', 'renewal', 'upgrade', 'downgrade',
           'cancellation', 'reactivation', 'trial_started', 'trial_converted'],
    required: true,
  })
  event: string;

  @Prop() fromPlan: string;
  @Prop() toPlan: string;
  @Prop({ default: 0 }) amount: number;
  @Prop() currency: string;
  @Prop({
    enum: ['paid', 'pending', 'failed', 'refunded', 'free'],
    default: 'pending',
  })
  paymentStatus: string;
  @Prop() paymentMethod: string;
  @Prop() transactionId: string;
  @Prop() invoiceNumber: string;
  @Prop() notes: string;
  @Prop() processedBy: string; // super admin who processed
  @Prop() effectiveDate: Date;
}

export const SubscriptionHistorySchema = SchemaFactory.createForClass(SubscriptionHistory);
SubscriptionHistorySchema.index({ institutionSlug: 1, createdAt: -1 });

// ============================================================
// PLATFORM USAGE LOG (daily snapshots per institution)
// ============================================================
export type UsageLogDocument = UsageLog & Document;

@Schema({ timestamps: true, collection: 'platform_usage_logs' })
export class UsageLog {
  @Prop({ required: true, index: true }) institutionSlug: string;
  @Prop({ required: true }) date: Date; // daily snapshot date

  @Prop({ default: 0 }) dailyLogins: number;
  @Prop({ default: 0 }) uniqueUsers: number;
  @Prop({ default: 0 }) studentsAdded: number;
  @Prop({ default: 0 }) attendanceMarked: number;
  @Prop({ default: 0 }) invoicesCreated: number;
  @Prop({ default: 0 }) documentsUploaded: number;
  @Prop({ default: 0 }) assessmentsCreated: number;
  @Prop({ default: 0 }) behaviourRecorded: number;
  @Prop({ default: 0 }) tarbiyahAssessed: number;

  @Prop({ type: [String], default: [] }) modulesAccessed: string[];
  @Prop({ type: Object, default: {} }) moduleUsageCount: Record<string, number>;
}

export const UsageLogSchema = SchemaFactory.createForClass(UsageLog);
UsageLogSchema.index({ institutionSlug: 1, date: -1 });
UsageLogSchema.index({ date: -1 });
// Unique per institution per day
UsageLogSchema.index({ institutionSlug: 1, date: 1 }, { unique: true });

// ============================================================
// PLATFORM ANNOUNCEMENT
// ============================================================
export type AnnouncementDocument = Announcement & Document;

@Schema({ timestamps: true, collection: 'platform_announcements' })
export class Announcement {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) message: string;
  @Prop({
    enum: ['info', 'warning', 'success', 'critical', 'maintenance'],
    default: 'info',
  })
  type: string;
  @Prop() targetPlans: string[]; // which plans to show to
  @Prop() targetInstitutions: string[]; // specific slugs, empty = all
  @Prop() scheduledAt: Date;
  @Prop() expiresAt: Date;
  @Prop({ default: true }) isActive: boolean;
  @Prop() createdBy: string;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

// ============================================================
// SUPPORT TICKET
// ============================================================
export type SupportTicketDocument = SupportTicket & Document;

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  @Prop({ required: true }) ticketNumber: string;
  @Prop({ required: true, index: true }) institutionSlug: string;
  @Prop({ required: true }) institutionName: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) description: string;
  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }) priority: string;
  @Prop({ enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' }) status: string;
  @Prop() category: string;
  @Prop() assignedTo: string;
  @Prop() resolution: string;
  @Prop() resolvedAt: Date;
  @Prop() reportedBy: string;
  @Prop() reportedByEmail: string;
  @Prop({ type: [{ message: String, by: String, at: Date }], default: [] })
  replies: { message: string; by: string; at: Date }[];
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
SupportTicketSchema.pre('validate', function () {
  if (this.isNew && !this.ticketNumber) {
    const rand = Math.floor(100000 + Math.random() * 900000);
    this.ticketNumber = `TKT-${rand}`;
  }
});
