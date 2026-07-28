import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SupportTicket, SupportTicketDocument } from '../super-admin/schemas/super-admin.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
  ) {}

  async create(dto: CreateTicketDto, ctx: { institutionSlug: string; reportedBy: string }) {
    const ticket = new this.ticketModel({
      ...dto,
      institutionSlug: ctx.institutionSlug,
      institutionName: dto.institutionName || ctx.institutionSlug,
      reportedBy: ctx.reportedBy,
      status: 'open',
    });
    return ticket.save();
  }

  async findMine(institutionSlug: string) {
    return this.ticketModel.find({ institutionSlug }).sort({ createdAt: -1 }).exec();
  }
}
