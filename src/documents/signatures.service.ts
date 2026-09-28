import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  SignatureRequest, SignatureRequestDocument,
} from './schemas/signature-request.schema';
import { DocumentRecord, DocumentRecordDocument } from './schemas/documents.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { EmailService } from '../email/email.service';

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

@Injectable()
export class SignaturesService {
  constructor(
    @InjectModel(SignatureRequest.name) private reqModel: Model<SignatureRequestDocument>,
    @InjectModel(DocumentRecord.name) private docModel: Model<DocumentRecordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  // ── Admin: dashboard / queue ────────────────────────────────────────────
  async getDashboard(schoolSlug: string, userEmail?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [awaitingYourSignature, sentForSignature, completedThisMonth, overdue] = await Promise.all([
      userEmail
        ? this.reqModel.countDocuments({
          schoolSlug, status: 'pending',
          recipients: { $elemMatch: { email: userEmail.toLowerCase(), status: { $in: ['pending', 'viewed'] } } },
        })
        : 0,
      this.reqModel.countDocuments({ schoolSlug, status: 'pending' }),
      this.reqModel.countDocuments({ schoolSlug, status: 'completed', completedAt: { $gte: startOfMonth } }),
      this.reqModel.countDocuments({ schoolSlug, status: 'pending', deadline: { $lt: now } }),
    ]);

    return { awaitingYourSignature, sentForSignature, completedThisMonth, overdue };
  }

  async list(schoolSlug: string, query: { status?: string; mine?: boolean; userEmail?: string }) {
    const filter: any = { schoolSlug };
    if (query.status) filter.status = query.status;
    if (query.mine && query.userEmail) {
      // "mine" means MY inbox - still THIS recipient's turn to act, not just
      // "I'm somewhere in the recipient list". In a sequential request the
      // overall request can still be 'pending' (waiting on someone else)
      // after this recipient has already signed - without the status
      // constraint here, an already-signed document would keep showing up
      // in the viewer's own "Pending Signatures" queue.
      filter.recipients = { $elemMatch: { email: query.userEmail.toLowerCase(), status: { $in: ['pending', 'viewed'] } } };
    }
    return this.reqModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async getById(schoolSlug: string, id: string) {
    const request = await this.reqModel.findOne({ _id: id, schoolSlug }).lean();
    if (!request) throw new NotFoundException('Signature request not found');
    return request;
  }

  // ── Admin: create / cancel ──────────────────────────────────────────────
  async create(schoolSlug: string, createdBy: string, createdByEmail: string | undefined, data: {
    documentId?: string; documentName?: string; fileUrl?: string; fileName?: string;
    recipients: { name: string; email: string }[];
    signingOrder?: 'any' | 'sequential';
    deadline?: string; message?: string;
  }) {
    if (!data.recipients || data.recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }
    for (const r of data.recipients) {
      if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
        throw new BadRequestException(`"${r.email || r.name || ''}" is not a valid email address`);
      }
    }

    let documentName = data.documentName;
    let fileUrl = data.fileUrl;
    let fileName = data.fileName;
    let documentId: Types.ObjectId | null = null;

    if (data.documentId) {
      const doc = await this.docModel.findOne({ _id: data.documentId, schoolSlug }).lean();
      if (!doc) throw new BadRequestException('Selected document not found');
      documentId = doc._id as any;
      documentName = doc.title;
      fileUrl = doc.fileUrl;
      fileName = doc.fileName;
    }

    if (!fileUrl) throw new BadRequestException('Select a document from the library or attach a file');
    if (!documentName) documentName = fileName || 'Untitled document';

    const recipients = data.recipients.map((r, i) => ({
      name: r.name || r.email,
      email: r.email.toLowerCase(),
      order: i,
      status: 'pending' as const,
      token: makeToken(),
    }));

    const request = await this.reqModel.create({
      documentId, documentName, fileUrl, fileName,
      recipients,
      signingOrder: data.signingOrder === 'sequential' ? 'sequential' : 'any',
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      message: data.message,
      status: 'pending',
      createdBy, createdByEmail: createdByEmail?.toLowerCase(),
      schoolSlug,
    });

    // Sequential order only emails the first recipient up front - everyone
    // else is notified as their turn comes up (see recordSignature below).
    // 'any' order emails everyone immediately.
    const toNotifyNow = request.signingOrder === 'sequential'
      ? recipients.filter(r => r.order === 0)
      : recipients;
    await this.notifyRecipients(request, toNotifyNow);

    return request.toObject();
  }

  async cancel(schoolSlug: string, id: string) {
    const request = await this.reqModel.findOneAndUpdate(
      { _id: id, schoolSlug, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { new: true },
    );
    if (!request) throw new NotFoundException('Pending signature request not found');
    return request;
  }

  private async notifyRecipients(request: SignatureRequestDocument, recipients: { name: string; email: string; token: string }[]) {
    const deadlineStr = request.deadline ? new Date(request.deadline).toLocaleDateString() : undefined;
    const baseUrl = process.env.FRONTEND_URL || 'https://app.eldermin.com';
    await Promise.all(recipients.map((r) =>
      this.emailService.sendSignatureRequest(
        r.email, r.name, request.documentName, request.createdBy, 'Your School',
        `${baseUrl}/e-sign/${r.token}`, request.message, deadlineStr,
      ).catch(() => { /* best-effort - the request itself is still created and visible in-app either way */ }),
    ));
  }

  // ── Recipient: public (token) access ────────────────────────────────────
  async getByToken(token: string) {
    const request = await this.reqModel.findOne({ 'recipients.token': token }).lean();
    if (!request) throw new NotFoundException('This signature link is invalid or has expired');
    const recipient = request.recipients.find((r) => r.token === token);
    if (!recipient) throw new NotFoundException('This signature link is invalid or has expired');

    if (recipient.status === 'pending') {
      await this.reqModel.updateOne(
        { _id: request._id, 'recipients.token': token },
        { $set: { 'recipients.$.status': 'viewed', 'recipients.$.viewedAt': new Date() } },
      );
      recipient.status = 'viewed';
    }

    const canSignNow = request.signingOrder === 'any'
      || request.recipients.filter((r) => r.order < recipient.order).every((r) => r.status === 'signed');

    return {
      requestId: request._id,
      documentName: request.documentName,
      fileUrl: request.fileUrl,
      message: request.message,
      deadline: request.deadline,
      requestStatus: request.status,
      sentBy: request.createdBy,
      recipientName: recipient.name,
      recipientStatus: recipient.status,
      signingOrder: request.signingOrder,
      canSignNow,
    };
  }

  async signByToken(token: string, data: { typedName: string; signatureImage?: string }, ipAddress?: string) {
    return this.recordSignature({ token }, data, ipAddress);
  }

  async declineByToken(token: string, reason?: string) {
    return this.recordDecline({ token }, reason);
  }

  // ── Recipient: in-app (authenticated) access, matched by email ─────────
  async signAsUser(schoolSlug: string, id: string, userEmail: string, data: { typedName: string; designation?: string; signatureImage?: string }, ipAddress?: string) {
    const recipient = await this.findRecipientForUser(schoolSlug, id, userEmail);
    return this.recordSignature({ id, schoolSlug }, data, ipAddress, recipient.token);
  }

  async declineAsUser(schoolSlug: string, id: string, userEmail: string, reason?: string) {
    const recipient = await this.findRecipientForUser(schoolSlug, id, userEmail);
    return this.recordDecline({ token: recipient.token }, reason);
  }

  private async findRecipientForUser(schoolSlug: string, id: string, userEmail: string) {
    const request = await this.reqModel.findOne({ _id: id, schoolSlug }).lean();
    if (!request) throw new NotFoundException('Signature request not found');
    const recipient = request.recipients.find((r) => r.email === userEmail.toLowerCase());
    if (!recipient) throw new ForbiddenException('You are not a recipient on this signature request');
    return recipient;
  }

  private async recordSignature(
    locator: { token: string } | { id: string; schoolSlug: string },
    data: { typedName: string; designation?: string; signatureImage?: string },
    ipAddress?: string,
    knownToken?: string,
  ) {
    if (!data.typedName?.trim()) throw new BadRequestException('Type your full name to sign');

    const filter = 'token' in locator ? { 'recipients.token': locator.token } : { _id: locator.id, schoolSlug: locator.schoolSlug };
    const request = await this.reqModel.findOne(filter);
    if (!request) throw new NotFoundException('Signature request not found');
    const token = 'token' in locator ? locator.token : knownToken!;
    const recipient = request.recipients.find((r) => r.token === token);
    if (!recipient) throw new NotFoundException('Signature request not found');

    if (request.status === 'cancelled') throw new BadRequestException('This request was cancelled');
    if (request.status === 'declined') throw new BadRequestException('This request was already declined by another recipient');
    if (recipient.status === 'signed') throw new BadRequestException('You already signed this document');
    if (recipient.status === 'declined') throw new BadRequestException('You already declined this document');

    if (request.signingOrder === 'sequential') {
      const priorPending = request.recipients.filter((r) => r.order < recipient.order && r.status !== 'signed');
      if (priorPending.length > 0) {
        throw new BadRequestException('Earlier recipient(s) in the signing order have not signed yet');
      }
    }

    recipient.status = 'signed';
    recipient.signedAt = new Date();
    recipient.typedName = data.typedName.trim();
    recipient.designation = data.designation?.trim();
    recipient.signatureImage = data.signatureImage;
    recipient.ipAddress = ipAddress;

    const allSigned = request.recipients.every((r) => r.status === 'signed');
    if (allSigned) {
      request.status = 'completed';
      request.completedAt = new Date();
    } else if (request.signingOrder === 'sequential') {
      const next = request.recipients.find((r) => r.order === recipient.order + 1);
      if (next) await this.notifyRecipients(request, [next]);
    }

    await request.save();

    if (allSigned && request.createdByEmail) {
      await this.emailService.sendSignatureStatusUpdate(
        request.createdByEmail, request.createdBy, request.documentName, 'Your School', 'completed',
      ).catch(() => {});
    }

    return request.toObject();
  }

  private async recordDecline(locator: { token: string }, reason?: string) {
    const request = await this.reqModel.findOne({ 'recipients.token': locator.token });
    if (!request) throw new NotFoundException('Signature request not found');
    const recipient = request.recipients.find((r) => r.token === locator.token);
    if (!recipient) throw new NotFoundException('Signature request not found');

    if (recipient.status === 'signed') throw new BadRequestException('You already signed this document');

    recipient.status = 'declined';
    recipient.declinedAt = new Date();
    recipient.declineReason = reason;
    request.status = 'declined';
    await request.save();

    if (request.createdByEmail) {
      await this.emailService.sendSignatureStatusUpdate(
        request.createdByEmail, request.createdBy, request.documentName, 'Your School', 'declined',
        recipient.name, reason,
      ).catch(() => {});
    }

    return request.toObject();
  }

  // Resolves the logged-in user's email (not carried on the JWT itself -
  // see jwt.strategy.ts) so "Awaiting Your Signature" can match them
  // against recipients by email.
  async resolveUserEmail(userId?: string): Promise<string | undefined> {
    if (!userId) return undefined;
    const user = await this.userModel.findById(userId).select('email').lean();
    return user?.email;
  }
}
