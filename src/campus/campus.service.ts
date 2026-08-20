import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
  Building, BuildingDocument,
  CampusRoom, CampusRoomDocument,
  UtilityReading, UtilityReadingDocument,
  Visitor, VisitorDocument,
} from './campus.schema';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

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
    @InjectModel(Building.name) private buildingModel: Model<BuildingDocument>,
    @InjectModel(CampusRoom.name) private campusRoomModel: Model<CampusRoomDocument>,
    @InjectModel(UtilityReading.name) private utilityReadingModel: Model<UtilityReadingDocument>,
    @InjectModel(Visitor.name) private visitorModel: Model<VisitorDocument>,
  ) {}

  async getDashboard(schoolSlug: string) {
    const now = new Date();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalVehicles, activeVehicles, totalRoutes,
      totalTransportStudents, vehiclesNeedingService,
      totalBeds, occupiedBeds, hostelBlocks,
      hostelStudents,
      openMaintenance, urgentMaintenance,
      completedThisMonth, maintenanceCostThisMonth,
      totalAssets, assetsByCondition,
      assetsNeedingInspection,
      upcomingEvents, ongoingEvents,
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

  async createVehicle(data: any) {
    return new this.vehicleModel(data).save();
  }

  async getVehicles(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, search, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (campusId) filter.campusId = campusId;
    if (search) filter.$or = [
      { registrationNumber: { $regex: search, $options: 'i' } },
      { make: { $regex: search, $options: 'i' } },
      { driverName: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.vehicleModel.find(filter).sort({ registrationNumber: 1 }).skip(skip).limit(+limit),
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
    const { page = 1, limit = 20, status, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (campusId) filter.campusId = campusId;
    const [data, total] = await Promise.all([
      this.routeModel.find(filter).sort({ name: 1 }).skip(skip).limit(+limit),
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
    await this.studentTransportModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(data.studentId), schoolSlug: data.schoolSlug, isActive: true },
      { $set: { isActive: false, endDate: new Date() } },
    );
    const allocation = new this.studentTransportModel({ ...data, startDate: new Date() });
    const saved = await allocation.save();
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

  async createBlock(data: any) {
    return new this.blockModel(data).save();
  }

  async getBlocks(schoolSlug: string, campusId?: string) {
    const filter: any = { schoolSlug };
    if (campusId) filter.campusId = campusId;
    return this.blockModel.find(filter).sort({ name: 1 });
  }

  async createRoom(data: any) {
    return new this.roomModel(data).save();
  }

  async getRooms(schoolSlug: string, query: any) {
    const { blockId, status, type, campusId } = query;
    const filter: any = { schoolSlug };
    if (blockId) filter.blockId = blockId;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (campusId) filter.campusId = campusId;
    return this.roomModel.find(filter).sort({ roomNumber: 1 });
  }

  async allocateHostel(data: any) {
    const room = await this.roomModel.findById(data.roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.occupancy >= room.capacity) throw new Error('Room is full');
    const alloc = new this.allocationModel({
      ...data,
      checkInDate: new Date(data.checkInDate || Date.now()),
    });
    await alloc.save();
    const newOccupancy = room.occupancy + 1;
    await this.roomModel.findByIdAndUpdate(data.roomId, {
      $set: {
        occupancy: newOccupancy,
        status: newOccupancy >= room.capacity ? 'full' : 'available',
      },
    });
    await this.blockModel.findByIdAndUpdate(data.blockId, { $inc: { occupiedBeds: 1 } });
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
    const { page = 1, limit = 20, blockId, status, search, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (blockId) filter.blockId = blockId;
    if (status) filter.status = status;
    if (campusId) filter.campusId = campusId;
    if (search) filter.studentName = { $regex: search, $options: 'i' };
    const [data, total] = await Promise.all([
      this.allocationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit),
      this.allocationModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createMaintenance(data: any) {
    return new this.maintenanceModel(data).save();
  }

  async getMaintenanceRequests(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, priority, category, search, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (campusId) filter.campusId = campusId;
    if (search) filter.$or = [
      { mrNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.maintenanceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit),
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
      this.assetModel.find(filter).sort({ name: 1 }).skip(skip).limit(+limit),
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
      this.eventModel.find(filter).sort({ startDate: 1 }).skip(skip).limit(+limit),
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

  // ── Buildings ────────────────────────────────────────────────
  async createBuilding(data: any) {
    return new this.buildingModel(data).save();
  }

  async getBuildings(schoolSlug: string, query: any) {
    const { page = 1, limit = 50, campusId, type, status, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (campusId) filter.campusId = campusId;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.buildingModel.find(filter).sort({ name: 1 }).skip(skip).limit(+limit),
      this.buildingModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateBuilding(id: string, schoolSlug: string, data: any) {
    const building = await this.buildingModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  async deleteBuilding(id: string, schoolSlug: string) {
    const building = await this.buildingModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  // ── Campus Rooms (classroom/lab/office - distinct from HostelRoom) ──
  async createCampusRoom(data: any) {
    const building = await this.buildingModel.findOne({ _id: data.buildingId, schoolSlug: data.schoolSlug });
    if (!building) throw new NotFoundException('Building not found');
    return new this.campusRoomModel({ ...data, buildingName: building.name, campusId: data.campusId || building.campusId }).save();
  }

  async getCampusRooms(schoolSlug: string, query: any) {
    const { page = 1, limit = 50, buildingId, campusId, type, availability, status, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (buildingId) filter.buildingId = buildingId;
    if (campusId) filter.campusId = campusId;
    if (type) filter.type = type;
    if (availability) filter.availability = availability;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { roomNumber: { $regex: search, $options: 'i' } },
      { buildingName: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.campusRoomModel.find(filter).sort({ buildingName: 1, roomNumber: 1 }).skip(skip).limit(+limit),
      this.campusRoomModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateCampusRoom(id: string, schoolSlug: string, data: any) {
    // Re-resolve buildingName if the room is being moved to a different
    // building, same reasoning as create - never trust a denormalized
    // name to be sent correctly, always derive it from the real record.
    if (data.buildingId) {
      const building = await this.buildingModel.findOne({ _id: data.buildingId, schoolSlug });
      if (!building) throw new NotFoundException('Building not found');
      data.buildingName = building.name;
    }
    const room = await this.campusRoomModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async deleteCampusRoom(id: string, schoolSlug: string) {
    const room = await this.campusRoomModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  // ── Utility Readings ─────────────────────────────────────────
  // consumption is deliberately never stored - always derived from
  // currentReading - previousReading, so it can never drift out of sync
  // if either value is corrected later.
  private withConsumption(reading: any) {
    const obj = reading.toObject ? reading.toObject() : reading;
    return { ...obj, consumption: (obj.currentReading ?? 0) - (obj.previousReading ?? 0) };
  }

  async createUtilityReading(data: any) {
    let buildingName = data.buildingName;
    if (data.buildingId) {
      const building = await this.buildingModel.findOne({ _id: data.buildingId, schoolSlug: data.schoolSlug });
      if (!building) throw new NotFoundException('Building not found');
      buildingName = building.name;
      data.campusId = data.campusId || building.campusId;
    } else if (!buildingName) {
      // A reading with no building link at all (e.g. campus-wide solar
      // generation) still needs a real, honest label rather than
      // silently showing blank.
      buildingName = 'Campus-wide';
    }
    const reading = await new this.utilityReadingModel({ ...data, buildingName }).save();
    return this.withConsumption(reading);
  }

  async getUtilityReadings(schoolSlug: string, query: any) {
    const { page = 1, limit = 50, buildingId, campusId, type, status, from, to } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (buildingId) filter.buildingId = buildingId;
    if (campusId) filter.campusId = campusId;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (from || to) {
      filter.readingDate = {};
      if (from) filter.readingDate.$gte = new Date(from);
      if (to) filter.readingDate.$lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      this.utilityReadingModel.find(filter).sort({ readingDate: -1 }).skip(skip).limit(+limit),
      this.utilityReadingModel.countDocuments(filter),
    ]);
    return { data: data.map((r) => this.withConsumption(r)), meta: { total, page, limit } };
  }

  async updateUtilityReading(id: string, schoolSlug: string, data: any) {
    if (data.buildingId) {
      const building = await this.buildingModel.findOne({ _id: data.buildingId, schoolSlug });
      if (!building) throw new NotFoundException('Building not found');
      data.buildingName = building.name;
    }
    const reading = await this.utilityReadingModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!reading) throw new NotFoundException('Utility reading not found');
    return this.withConsumption(reading);
  }

  async deleteUtilityReading(id: string, schoolSlug: string) {
    const reading = await this.utilityReadingModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!reading) throw new NotFoundException('Utility reading not found');
    return reading;
  }

  // ── Visitors (security gate log) ────────────────────────────
  // Auto-generated server-side rather than trusted from the frontend -
  // avoids a real collision risk if multiple gates check visitors in at
  // the same time. Retries once on a genuine race (two check-ins
  // querying the same "highest badge" moment apart, both attempting the
  // same next number) - rare for a gate-level check-in flow, but the
  // compound unique index would otherwise throw a raw duplicate-key
  // error instead of just quietly succeeding on retry.
  private async generateVisitorBadge(schoolSlug: string): Promise<string> {
    const latest = await this.visitorModel.findOne({ schoolSlug }).sort({ createdAt: -1 }).select('badge').lean();
    const latestNum = latest?.badge ? parseInt(latest.badge.replace('V-', ''), 10) : 840;
    return `V-${String((isNaN(latestNum) ? 840 : latestNum) + 1).padStart(4, '0')}`;
  }

  async checkInVisitor(data: any) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const badge = await this.generateVisitorBadge(data.schoolSlug);
      try {
        return await new this.visitorModel({ ...data, badge, checkInTime: data.checkInTime || new Date(), status: 'Inside' }).save();
      } catch (err: any) {
        if (err.code === 11000 && attempt === 0) continue; // genuine race - retry once with a fresh number
        throw err;
      }
    }
    throw new BadRequestException('Could not generate a unique visitor badge - please try again');
  }

  async getVisitors(schoolSlug: string, query: any) {
    const { page = 1, limit = 50, campusId, status, search, from, to } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (campusId) filter.campusId = campusId;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { badge: { $regex: search, $options: 'i' } },
      { purpose: { $regex: search, $options: 'i' } },
    ];
    if (from || to) {
      filter.checkInTime = {};
      if (from) filter.checkInTime.$gte = new Date(from);
      if (to) filter.checkInTime.$lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      this.visitorModel.find(filter).sort({ checkInTime: -1 }).skip(skip).limit(+limit),
      this.visitorModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async checkOutVisitor(badge: string, schoolSlug: string) {
    const visitor = await this.visitorModel.findOneAndUpdate(
      { badge, schoolSlug, status: 'Inside' },
      { $set: { checkOutTime: new Date(), status: 'Checked Out' } },
      { new: true },
    );
    if (!visitor) throw new NotFoundException('Visitor not found, or already checked out');
    return visitor;
  }
}
