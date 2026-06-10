// ============================================================
// CAMPUS OPERATIONS — SERVICE + CONTROLLER + MODULE
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Vehicle, VehicleDocument,
  TransportRoute, TransportRouteDocument,
  StudentTransport, StudentTransportDocument,
  HostelBlock, HostelBlockDocument,
  HostelRoom, HostelRoomDocument,
  HostelAllocation, HostelAllocationDocument,
  MaintenanceRequest, MaintenanceRequestDocument,
  Asset, AssetDocument,
  SchoolEvent, SchoolEventDocument,
} from './campus.schema';
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  VehicleSchema, TransportRouteSchema, StudentTransportSchema,
  HostelBlockSchema, HostelRoomSchema, HostelAllocationSchema,
  MaintenanceRequestSchema, AssetSchema, SchoolEventSchema,
} from './campus.schema';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

// ============================================================
// CAMPUS OPERATIONS SERVICE
// ============================================================
@Injectable()
export class CampusService {
  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(TransportRoute.name) private routeModel: Model<TransportRouteDocument>,
    @InjectModel(StudentTransport.name) private studentTransportModel: Model<StudentTransportDocument>,
    @InjectModel(HostelBlock.name) private blockModel: Model<HostelBlockDocument>,
    @InjectModel(HostelRoom.name) private roomModel: Model<HostelRoomDocument>,
    @InjectModel(HostelAllocation.name) private allocationModel: Model<HostelAllocationDocument>,
    @InjectModel(MaintenanceRequest.name) private maintenanceModel: Model<MaintenanceRequestDocument>,
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
    @InjectModel(SchoolEvent.name) private eventModel: Model<SchoolEventDocument>,
  ) {}

  // ── DASHBOARD ────────────────────────────────────────────
  async getDashboard(schoolSlug: string) {
    const now = new Date();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      // Transport
      totalVehicles, activeVehicles, totalRoutes,
      totalTransportStudents, vehiclesNeedingService,

      // Hostel
      totalBeds, occupiedBeds, hostelBlocks,
      hostelStudents,

      // Maintenance
      openMaintenance, urgentMaintenance,
      completedThisMonth, maintenanceCostThisMonth,

      // Assets
      totalAssets, assetsByCondition,
      assetsNeedingInspection,

      // Events
      upcomingEvents, ongoingEvents,

      // Recent
      recentMaintenance, upcomingEventsDetail,
    ] = await Promise.all([
      this.vehicleModel.countDocuments({ schoolSlug }),
      this.vehicleModel.countDocuments({ schoolSlug, status: 'active' }),
      this.routeModel.countDocuments({ schoolSlug, status: 'active' }),
      this.studentTransportModel.countDocuments({ schoolSlug, isActive: true }),
      this.vehicleModel.countDocuments({
        schoolSlug,
        $or: [
          { fitnessExpiry: { $lte: in7Days } },
          { insuranceExpiry: { $lte: in7Days } },
          { nextServiceDate: { $lte: in7Days } },
        ],
      }),

      this.roomModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: null, total: { $sum: '$capacity' }, occupied: { $sum: '$occupancy' } } },
      ]),
      this.roomModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: null, occupied: { $sum: '$occupancy' } } },
      ]),
      this.blockModel.countDocuments({ schoolSlug, status: 'active' }),
      this.allocationModel.countDocuments({ schoolSlug, status: 'active' }),

      this.maintenanceModel.countDocuments({ schoolSlug, status: { $in: ['open', 'assigned', 'in_progress'] } }),
      this.maintenanceModel.countDocuments({ schoolSlug, priority: 'emergency', status: { $ne: 'completed' } }),
      this.maintenanceModel.countDocuments({ schoolSlug, status: 'completed', completedAt: { $gte: monthStart } }),
      this.maintenanceModel.aggregate([
        { $match: { schoolSlug, status: 'completed', completedAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$actualCost' } } },
      ]),

      this.assetModel.countDocuments({ schoolSlug, status: 'active' }),
      this.assetModel.aggregate([
        { $match: { schoolSlug, status: 'active' } },
        { $group: { _id: '$condition', count: { $sum: 1 } } },
      ]),
      this.assetModel.countDocuments({
        schoolSlug,
        nextInspectionDate: { $lte: in7Days },
        status: 'active',
      }),

      this.eventModel.countDocuments({ schoolSlug, status: 'upcoming', startDate: { $gte: now } }),
      this.eventModel.countDocuments({ schoolSlug, status: 'ongoing' }),

      this.maintenanceModel.find({ schoolSlug })
        .sort({ createdAt: -1 }).limit(5)
        .select('mrNumber title category priority status location reportedBy createdAt'),
      this.eventModel.find({ schoolSlug, status: 'upcoming', startDate: { $gte: now } })
        .sort({ startDate: 1 }).limit(5)
        .select('title category startDate startTime venue expectedAttendance'),
    ]);

    const totalBedsCount = totalBeds[0]?.total || 0;
    const occupiedBedsCount = occupiedBeds[0]?.occupied || 0;

    return {
      transport: {
        totalVehicles, activeVehicles, totalRoutes,
        totalStudents: totalTransportStudents,
        vehiclesNeedingAttention: vehiclesNeedingService,
      },
      hostel: {
        hostelBlocks, hostelStudents,
        totalBeds: totalBedsCount,
        occupiedBeds: occupiedBedsCount,
        availableBeds: totalBedsCount - occupiedBedsCount,
        occupancyRate: totalBedsCount > 0
          ? parseFloat(((occupiedBedsCount / totalBedsCount) * 100).toFixed(1)) : 0,
      },
      maintenance: {
        open: openMaintenance, urgent: urgentMaintenance,
        completedThisMonth,
        costThisMonth: maintenanceCostThisMonth[0]?.total || 0,
      },
      assets: {
        total: totalAssets,
        byCondition: assetsByCondition,
        needingInspection: assetsNeedingInspection,
      },
      events: { upcoming: upcomingEvents, ongoing: ongoingEvents },
      recentMaintenance,
      upcomingEvents: upcomingEventsDetail,
    };
  }

  // ── TRANSPORT ────────────────────────────────────────────
  async createVehicle(data: any) {
    return new this.vehicleModel(data).save();
  }

  async getVehicles(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (search) filter.$or = [
      { registrationNumber: { $regex: search, $options: 'i' } },
      { make: { $regex: search, $options: 'i' } },
      { driverName: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.vehicleModel.find(filter).sort({ registrationNumber: 1 }).skip(skip).limit(limit),
      this.vehicleModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateVehicle(id: string, schoolSlug: string, data: any) {
    return this.vehicleModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async createRoute(data: any) {
    const count = await this.routeModel.countDocuments({ schoolSlug: data.schoolSlug });
    data.code = `R-${String(count + 1).padStart(3, '0')}`;
    return new this.routeModel(data).save();
  }

  async getRoutes(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    const [data, total] = await Promise.all([
      this.routeModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      this.routeModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateRoute(id: string, schoolSlug: string, data: any) {
    return this.routeModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async getRouteStudents(routeId: string, schoolSlug: string) {
    return this.studentTransportModel.find({ routeId, schoolSlug, isActive: true });
  }

  async allocateStudentTransport(data: any) {
    // Deactivate existing
    await this.studentTransportModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(data.studentId), schoolSlug: data.schoolSlug, isActive: true },
      { $set: { isActive: false, endDate: new Date() } },
    );
    const allocation = new this.studentTransportModel({ ...data, startDate: new Date() });
    const saved = await allocation.save();
    // Update route student count
    await this.routeModel.findByIdAndUpdate(data.routeId, { $inc: { totalStudents: 1 } });
    return saved;
  }

  async removeStudentTransport(id: string, schoolSlug: string) {
    const alloc = await this.studentTransportModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { isActive: false, endDate: new Date() } }, { new: true },
    );
    if (alloc) await this.routeModel.findByIdAndUpdate(alloc.routeId, { $inc: { totalStudents: -1 } });
    return alloc;
  }

  // ── HOSTEL ───────────────────────────────────────────────
  async createBlock(data: any) {
    return new this.blockModel(data).save();
  }

  async getBlocks(schoolSlug: string) {
    return this.blockModel.find({ schoolSlug }).sort({ name: 1 });
  }

  async createRoom(data: any) {
    return new this.roomModel(data).save();
  }

  async getRooms(schoolSlug: string, query: any) {
    const { blockId, status, type } = query;
    const filter: any = { schoolSlug };
    if (blockId) filter.blockId = blockId;
    if (status) filter.status = status;
    if (type) filter.type = type;
    return this.roomModel.find(filter).sort({ roomNumber: 1 });
  }

  async allocateHostel(data: any) {
    // Check room availability
    const room = await this.roomModel.findById(data.roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.occupancy >= room.capacity) throw new Error('Room is full');

    const alloc = new this.allocationModel({
      ...data,
      checkInDate: new Date(data.checkInDate || Date.now()),
    });
    await alloc.save();

    // Update room occupancy
    const newOccupancy = room.occupancy + 1;
    await this.roomModel.findByIdAndUpdate(data.roomId, {
      $set: {
        occupancy: newOccupancy,
        status: newOccupancy >= room.capacity ? 'full' : 'available',
      },
    });

    // Update block counts
    await this.blockModel.findByIdAndUpdate(data.blockId, {
      $inc: { occupiedBeds: 1 },
    });

    return alloc;
  }

  async checkOutHostel(id: string, schoolSlug: string) {
    const alloc = await this.allocationModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'checked_out', checkOutDate: new Date() } },
      { new: true },
    );
    if (alloc) {
      await this.roomModel.findByIdAndUpdate(alloc.roomId, { $inc: { occupancy: -1 }, $set: { status: 'available' } });
      await this.blockModel.findByIdAndUpdate(alloc.blockId, { $inc: { occupiedBeds: -1 } });
    }
    return alloc;
  }

  async getHostelAllocations(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, blockId, status, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (blockId) filter.blockId = blockId;
    if (status) filter.status = status;
    if (search) filter.studentName = { $regex: search, $options: 'i' };
    const [data, total] = await Promise.all([
      this.allocationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.allocationModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  // ── MAINTENANCE ──────────────────────────────────────────
  async createMaintenance(data: any) {
    return new this.maintenanceModel(data).save();
  }

  async getMaintenanceRequests(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, priority, category, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (search) filter.$or = [
      { mrNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.maintenanceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.maintenanceModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateMaintenanceStatus(id: string, schoolSlug: string, data: any) {
    const update: any = { status: data.status };
    if (data.status === 'assigned') { update.assignedTo = data.assignedTo; update.assignedAt = new Date(); }
    if (data.status === 'in_progress') update.startedAt = new Date();
    if (data.status === 'completed') {
      update.completedAt = new Date();
      update.completionNotes = data.completionNotes;
      update.actualCost = data.actualCost;
    }
    if (data.status === 'rejected') update.rejectionReason = data.rejectionReason;
    return this.maintenanceModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
  }

  async getMaintenanceStats(schoolSlug: string) {
    const [byStatus, byCategory, byPriority, avgResolutionTime] = await Promise.all([
      this.maintenanceModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.maintenanceModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$category', count: { $sum: 1 }, totalCost: { $sum: '$actualCost' } } },
        { $sort: { count: -1 } },
      ]),
      this.maintenanceModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      this.maintenanceModel.aggregate([
        { $match: { schoolSlug, status: 'completed', completedAt: { $exists: true } } },
        { $project: { hours: { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 3600000] } } },
        { $group: { _id: null, avg: { $avg: '$hours' } } },
      ]),
    ]);
    return { byStatus, byCategory, byPriority, avgResolutionHours: avgResolutionTime[0]?.avg?.toFixed(1) || 0 };
  }

  // ── ASSETS ───────────────────────────────────────────────
  async createAsset(data: any) {
    data.currentValue = data.purchasePrice || 0;
    return new this.assetModel(data).save();
  }

  async getAssets(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, category, condition, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { assetCode: { $regex: search, $options: 'i' } },
      { serialNumber: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.assetModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      this.assetModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateAsset(id: string, schoolSlug: string, data: any) {
    return this.assetModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async disposeAsset(id: string, schoolSlug: string, reason: string) {
    return this.assetModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'disposed', disposalDate: new Date(), disposalReason: reason } },
      { new: true },
    );
  }

  async getAssetSummary(schoolSlug: string) {
    const [byCategory, byCondition, totalValue] = await Promise.all([
      this.assetModel.aggregate([
        { $match: { schoolSlug, status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
        { $sort: { value: -1 } },
      ]),
      this.assetModel.aggregate([
        { $match: { schoolSlug, status: 'active' } },
        { $group: { _id: '$condition', count: { $sum: 1 } } },
      ]),
      this.assetModel.aggregate([
        { $match: { schoolSlug, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$currentValue' }, purchase: { $sum: '$purchasePrice' } } },
      ]),
    ]);
    return {
      byCategory, byCondition,
      totalCurrentValue: totalValue[0]?.total || 0,
      totalPurchaseValue: totalValue[0]?.purchase || 0,
    };
  }

  // ── EVENTS ───────────────────────────────────────────────
  async createEvent(data: any) {
    return new this.eventModel({
      ...data,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    }).save();
  }

  async getEvents(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, category, from, to, upcoming } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (upcoming === 'true') filter.startDate = { $gte: new Date() };
    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from);
      if (to) filter.startDate.$lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      this.eventModel.find(filter).sort({ startDate: 1 }).skip(skip).limit(limit),
      this.eventModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateEvent(id: string, schoolSlug: string, data: any) {
    return this.eventModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async updateEventStatus(id: string, schoolSlug: string, status: string, attendance?: number) {
    const update: any = { status };
    if (attendance !== undefined) update.actualAttendance = attendance;
    return this.eventModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
  }
}

// ============================================================
// CAMPUS OPERATIONS CONTROLLER
// ============================================================
@Controller('campus')
export class CampusController {
  constructor(private readonly service: CampusService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
    };
  }

  // Dashboard
  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug);
  }

  // ── Transport: Vehicles ───────────────────────────────────
  @Get('transport/vehicles')
  async getVehicles(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVehicles(schoolSlug, query);
  }

  @Post('transport/vehicles')
  @HttpCode(HttpStatus.CREATED)
  async createVehicle(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVehicle({ ...dto, schoolSlug });
  }

  @Put('transport/vehicles/:id')
  async updateVehicle(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateVehicle(id, schoolSlug, dto);
  }

  // ── Transport: Routes ─────────────────────────────────────
  @Get('transport/routes')
  async getRoutes(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRoutes(schoolSlug, query);
  }

  @Post('transport/routes')
  @HttpCode(HttpStatus.CREATED)
  async createRoute(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createRoute({ ...dto, schoolSlug });
  }

  @Put('transport/routes/:id')
  async updateRoute(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateRoute(id, schoolSlug, dto);
  }

  @Get('transport/routes/:id/students')
  async getRouteStudents(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRouteStudents(id, schoolSlug);
  }

  @Post('transport/students')
  @HttpCode(HttpStatus.CREATED)
  async allocateTransport(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.allocateStudentTransport({ ...dto, schoolSlug });
  }

  @Delete('transport/students/:id')
  async removeTransport(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.removeStudentTransport(id, schoolSlug);
  }

  // ── Hostel ────────────────────────────────────────────────
  @Get('hostel/blocks')
  async getBlocks(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBlocks(schoolSlug);
  }

  @Post('hostel/blocks')
  @HttpCode(HttpStatus.CREATED)
  async createBlock(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createBlock({ ...dto, schoolSlug });
  }

  @Get('hostel/rooms')
  async getRooms(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRooms(schoolSlug, query);
  }

  @Post('hostel/rooms')
  @HttpCode(HttpStatus.CREATED)
  async createRoom(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createRoom({ ...dto, schoolSlug });
  }

  @Get('hostel/allocations')
  async getAllocations(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getHostelAllocations(schoolSlug, query);
  }

  @Post('hostel/allocations')
  @HttpCode(HttpStatus.CREATED)
  async allocateHostel(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.allocateHostel({ ...dto, schoolSlug });
  }

  @Patch('hostel/allocations/:id/checkout')
  async checkOut(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.checkOutHostel(id, schoolSlug);
  }

  // ── Maintenance ───────────────────────────────────────────
  @Get('maintenance')
  async getMaintenance(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMaintenanceRequests(schoolSlug, query);
  }

  @Get('maintenance/stats')
  async getMaintenanceStats(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMaintenanceStats(schoolSlug);
  }

  @Post('maintenance')
  @HttpCode(HttpStatus.CREATED)
  async createMaintenance(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createMaintenance({
      ...dto, schoolSlug, reportedBy: dto.reportedBy || userName,
    });
  }

  @Patch('maintenance/:id/status')
  async updateMaintenanceStatus(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateMaintenanceStatus(id, schoolSlug, dto);
  }

  // ── Assets ────────────────────────────────────────────────
  @Get('assets')
  async getAssets(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssets(schoolSlug, query);
  }

  @Get('assets/summary')
  async getAssetSummary(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssetSummary(schoolSlug);
  }

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  async createAsset(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createAsset({ ...dto, schoolSlug });
  }

  @Put('assets/:id')
  async updateAsset(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateAsset(id, schoolSlug, dto);
  }

  @Patch('assets/:id/dispose')
  async disposeAsset(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.disposeAsset(id, schoolSlug, reason);
  }

  // ── Events ────────────────────────────────────────────────
  @Get('events')
  async getEvents(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEvents(schoolSlug, query);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createEvent({
      ...dto, schoolSlug, organizer: dto.organizer || userName,
    });
  }

  @Put('events/:id')
  async updateEvent(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEvent(id, schoolSlug, dto);
  }

  @Patch('events/:id/status')
  async updateEventStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; attendance?: number },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEventStatus(id, schoolSlug, dto.status, dto.attendance);
  }
}

// ============================================================
// CAMPUS OPERATIONS MODULE
// ============================================================
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vehicle.name, schema: VehicleSchema },
      { name: TransportRoute.name, schema: TransportRouteSchema },
      { name: StudentTransport.name, schema: StudentTransportSchema },
      { name: HostelBlock.name, schema: HostelBlockSchema },
      { name: HostelRoom.name, schema: HostelRoomSchema },
      { name: HostelAllocation.name, schema: HostelAllocationSchema },
      { name: MaintenanceRequest.name, schema: MaintenanceRequestSchema },
      { name: Asset.name, schema: AssetSchema },
      { name: SchoolEvent.name, schema: SchoolEventSchema },
    ]),
  ],
  controllers: [CampusController],
  providers: [CampusService],
  exports: [CampusService],
})
export class CampusModule {}
