// ============================================================
// PROVISIONING REQUEST — Eldermin Partner Network (Phase 2)
// Self-serve provisioning: a partner requests a new institution be
// created under them, instead of Super Admin doing it on their behalf
// (Phase 1's provisionInstitution). Per the rollout plan's Provisioning
// Queue spec — auto-approve when the partner has already proven
// themselves (higher tier + certified), manual review otherwise — see
// resellers.service.ts submitProvisioningRequest for the exact rule.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProvisioningRequestDocument = ProvisioningRequest & Document;

@Schema({ _id: false })
class InstitutionDraft {
  @Prop({ required: true }) name: string;
  @Prop() city: string;
  @Prop() country: string;
  @Prop({ default: 'starter' }) plan: string;
  @Prop() contactName: string;
  @Prop() contactEmail: string;
}

@Schema({ timestamps: true, collection: 'reseller_provisioning_requests' })
export class ProvisioningRequest {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Reseller', index: true })
  resellerId: Types.ObjectId;

  @Prop() resellerName: string;

  @Prop({ type: InstitutionDraft, required: true })
  institution: InstitutionDraft;

  @Prop() requestedBy: string;

  @Prop({
    enum: ['pending_review', 'approved', 'rejected'],
    default: 'pending_review',
    index: true,
  })
  status: string;

  @Prop({ default: false }) autoApproved: boolean;

  @Prop() reviewedBy: string;
  @Prop() reviewedAt: Date;
  @Prop() reviewNote: string;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  resultingInstitutionId: Types.ObjectId;
}

export const ProvisioningRequestSchema = SchemaFactory.createForClass(ProvisioningRequest);
ProvisioningRequestSchema.index({ status: 1, createdAt: -1 });
