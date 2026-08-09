import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomDocument = Room & Document;

// ============================================================
// ROOM / VENUE
// Previously the Timetable's "room" field was pure free text - no
// registry, no way to detect two classes double-booked into the same
// room, no capacity/type awareness. This is a real, first-class entity
// so Timetable (and eventually Campus Operations, which currently has
// this same gap with mock data) can actually validate against it.
// ============================================================
@Schema({ timestamps: true, collection: 'rooms' })
export class Room {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;

  @Prop({ required: true }) name: string; // e.g. "Room 101", "Science Lab 1"
  @Prop() code: string;
  @Prop({
    enum: ['classroom', 'lab', 'hall', 'gym', 'library', 'auditorium', 'art_room', 'music_room', 'other'],
    default: 'classroom',
  })
  type: string;
  @Prop({ default: 30 }) capacity: number;
  @Prop() building: string;
  @Prop() floor: string;
  @Prop({ default: true }) isActive: boolean;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
RoomSchema.index({ tenantId: 1, campusId: 1, isActive: 1 });
