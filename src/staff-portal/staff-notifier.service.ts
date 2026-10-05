import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '../parent-portal/schemas/notification-and-message.schema';

export interface NotifyInput {
  recipientUserId: string | Types.ObjectId | null | undefined;
  schoolSlug: string;
  type: string;
  title: string;
  body: string;
  relatedEntityId?: string;
}

/**
 * Writes rows into the shared `notifications` collection (same one the parent
 * app reads). Failure to notify must never fail the business action that
 * triggered it, so every error is swallowed and logged.
 */
@Injectable()
export class StaffNotifier {
  private readonly logger = new Logger(StaffNotifier.name);

  constructor(@InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>) {}

  async notify(input: NotifyInput): Promise<void> {
    if (!input.recipientUserId || !input.schoolSlug) return;
    try {
      await this.notificationModel.create({
        recipientUserId: input.recipientUserId,
        schoolSlug: input.schoolSlug,
        type: input.type,
        title: input.title,
        body: input.body,
        relatedEntityId: input.relatedEntityId,
      });
    } catch (err: any) {
      this.logger.warn(`notify failed (${input.type}): ${err?.message}`);
    }
  }
}
