// ============================================================
// CAMPUS OPERATIONS SCHEMAS — Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// TRANSPORT — VEHICLE
// ============================================================
export type VehicleDocument = Vehicle & Document;

@Schema({ timestamps: true, collection: 'transport_vehicles' })
export class Vehicle {
  @Prop({ required: true }) registrationNumber: string;
  @Prop({ required: true }) make: string;        // Toyota, Suzuki
  @Prop() model: string;                          // Hiace, Coaster
  @Prop() year: number;
  @Prop({ enum: ['bus', 'van', 'coaster', 'car', 'rickshaw'], default: 'van' }) type: string;
  @Prop({ required: true }) capacity: number;
  @Prop() color: string;
  @Prop() fuelType: string;                       // Petrol, Diesel, CNG
  @Prop() engineNumber: string;
  @Prop() chassisNumber: string;
  @Prop() fitnessExpiry: Date;
  @Prop() routePermitExpiry: Date;
  @Prop() insuranceExpiry: Date;
  @Prop() lastServiceDate: Date;
  @Prop() nextServiceDate: Date;
  @Prop() mileage: number;
  @Prop() campusId: string;
  @Prop({ enum: ['active', 'maintenance', 'inactive', 'retired'], default: 'active' }) status: string;
  @Prop() driverName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) driverId: Types.ObjectId;
  @Prop() driverPhone: string;
  @Prop() driverLicenseNumber: string;
  @Prop() driverLicenseExpiry: Date;
  @Prop() assignedRouteId: string;
  @Prop() notes: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
VehicleSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// TRANSPORT — ROUTE
// ============================================================
export type TransportRouteDocument = TransportRoute & Document;

@Schema({ _id: true })
class RouteStop {
  @Prop({ required: true }) name: string;
  @Prop() landmark: string;
  @Prop() order: number;
  @Prop() pickupTime: string;
  @Prop() dropTime: string;
  @Prop() lat: number;
  @Prop() lng: number;
}
const RouteStopSchema = SchemaFactory.createForClass(RouteStop);

@Schema({ timestamps: true, collection: 'transport_routes' })
export class TransportRoute {
  @Prop({ required: true }) name: string;            // Route A — DHA
  @Prop() code: string;                              // R-001
  @Prop() description: string;
  @Prop() startPoint: string;
  @Prop() endPoint: string;
  @Prop() estimatedDuration: number;                 // minutes
  @Prop() distanceKm: number;
  @Prop({ type: [RouteStopSchema], default: [] }) stops: RouteStop[];
  @Prop() vehicleId: string;
  @Prop() vehicleName: string;
  @Prop() driverName: string;
  @Prop() driverPhone: string;
  @Prop() morningPickupTime: string;
  @Prop() afternoonDropTime: string;
  @Prop({ default: 0 }) monthlyFee: number;
  @Prop({ default: 0 }) totalStudents: number;
  @Prop({ enum: ['active', 'inactive', 'suspended'], default: 'active' }) status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const TransportRouteSchema = SchemaFactory.createForClass(TransportRoute);
TransportRouteSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// TRANSPORT — STUDENT ALLOCATION
// ============================================================
export type StudentTransportDocument = StudentTransport & Document;

@Schema({ timestamps: true, collection: 'student_transport' })
export class StudentTransport {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ required: true }) routeId: string;
  @Prop({ required: true }) routeName: string;
  @Prop() stopName: string;
  @Prop() pickupTime: string;
  @Prop() dropTime: string;
  @Prop({ enum: ['both', 'pickup_only', 'drop_only'], default: 'both' }) serviceType: string;
  @Prop() guardianPhone: string;
  @Prop({ default: 0 }) monthlyFee: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop() startDate: Date;
  @Prop() endDate: Date;
  @Prop({ required: true }) academicYear: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const StudentTransportSchema = SchemaFactory.createForClass(StudentTransport);
StudentTransportSchema.index({ schoolSlug: 1, routeId: 1 });
StudentTransportSchema.index({ studentId: 1 });
StudentTransportSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// HOSTEL — BLOCK
// ============================================================
export type HostelBlockDocument = HostelBlock & Document;

@Schema({ timestamps: true, collection: 'hostel_blocks' })
export class HostelBlock {
  @Prop({ required: true }) name: string;             // Block A, Girls Wing
  @Prop() code: string;
  @Prop({ enum: ['boys', 'girls', 'mixed', 'staff'], required: true }) gender: string;
  @Prop() wardenName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) wardenId: Types.ObjectId;
  @Prop() wardenPhone: string;
  @Prop() floors: number;
  @Prop({ default: 0 }) totalRooms: number;
  @Prop({ default: 0 }) totalBeds: number;
  @Prop({ default: 0 }) occupiedBeds: number;
  @Prop() facilities: string[];                       // AC, Attached Bath, Study Room
  @Prop({ enum: ['active', 'maintenance', 'closed'], default: 'active' }) status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const HostelBlockSchema = SchemaFactory.createForClass(HostelBlock);
HostelBlockSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// HOSTEL — ROOM
// ============================================================
export type HostelRoomDocument = HostelRoom & Document;

@Schema({ timestamps: true, collection: 'hostel_rooms' })
export class HostelRoom {
  @Prop({ required: true }) roomNumber: string;
  @Prop({ required: true }) blockId: string;
  @Prop({ required: true }) blockName: string;
  @Prop() floor: number;
  @Prop({
    enum: ['single', 'double', 'triple', 'quad', 'dormitory'],
    default: 'double',
  })
  type: string;
  @Prop({ required: true }) capacity: number;
  @Prop({ default: 0 }) occupancy: number;
  @Prop({ default: 0 }) monthlyFee: number;
  @Prop() facilities: string[];
  @Prop({
    enum: ['available', 'full', 'maintenance', 'reserved'],
    default: 'available',
  })
  status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const HostelRoomSchema = SchemaFactory.createForClass(HostelRoom);
HostelRoomSchema.index({ schoolSlug: 1, blockId: 1, status: 1 });
HostelRoomSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// HOSTEL — ALLOCATION
// ============================================================
export type HostelAllocationDocument = HostelAllocation & Document;

@Schema({ timestamps: true, collection: 'hostel_allocations' })
export class HostelAllocation {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop({ required: true }) blockId: string;
  @Prop({ required: true }) blockName: string;
  @Prop({ required: true }) roomId: string;
  @Prop({ required: true }) roomNumber: string;
  @Prop() bedNumber: string;
  @Prop({ required: true }) checkInDate: Date;
  @Prop() checkOutDate: Date;
  @Prop({ default: 0 }) monthlyFee: number;
  @Prop() depositAmount: number;
  @Prop({ default: false }) depositPaid: boolean;
  @Prop({
    enum: ['active', 'checked_out', 'on_leave', 'suspended'],
    default: 'active',
  })
  status: string;
  @Prop() guardianName: string;
  @Prop() guardianPhone: string;
  @Prop() emergencyContact: string;
  @Prop() dietaryRequirements: string;
  @Prop() notes: string;
  @Prop({ required: true }) academicYear: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const HostelAllocationSchema = SchemaFactory.createForClass(HostelAllocation);
HostelAllocationSchema.index({ studentId: 1, status: 1 });
HostelAllocationSchema.index({ schoolSlug: 1, roomId: 1 });
HostelAllocationSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// MAINTENANCE REQUEST
// ============================================================
export type MaintenanceRequestDocument = MaintenanceRequest & Document;

@Schema({ timestamps: true, collection: 'maintenance_requests' })
export class MaintenanceRequest {
  @Prop({ required: true, unique: true }) mrNumber: string;   // MR-2025-0001
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;
  @Prop({
    enum: ['electrical', 'plumbing', 'civil', 'furniture', 'it',
           'cleaning', 'hvac', 'security', 'garden', 'other'],
    required: true,
  })
  category: string;
  @Prop({ enum: ['low', 'medium', 'high', 'emergency'], default: 'medium' }) priority: string;
  @Prop() location: string;                           // Room 12, Block A, Library
  @Prop() campusId: string;
  @Prop({ required: true }) reportedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reportedById: Types.ObjectId;
  @Prop({
    enum: ['open', 'assigned', 'in_progress', 'on_hold',
           'completed', 'rejected', 'cancelled'],
    default: 'open',
  })
  status: string;
  @Prop() assignedTo: string;
  @Prop() assignedAt: Date;
  @Prop() estimatedCost: number;
  @Prop() actualCost: number;
  @Prop() startedAt: Date;
  @Prop() completedAt: Date;
  @Prop() completionNotes: string;
  @Prop() rejectionReason: string;
  @Prop({ type: [String], default: [] }) photos: string[];
  @Prop({ type: [String], default: [] }) completionPhotos: string[];
  @Prop({ default: false }) requiresProcurement: boolean;   // links to procurement
  @Prop() scheduledDate: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const MaintenanceRequestSchema = SchemaFactory.createForClass(MaintenanceRequest);
MaintenanceRequestSchema.index({ schoolSlug: 1, status: 1, priority: 1 });
MaintenanceRequestSchema.pre('validate', function () {
  if (this.isNew && !this.mrNumber) {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    this.mrNumber = `MR-${y}-${r}`;
  }
});

// ============================================================
// ASSET
// ============================================================
export type AssetDocument = Asset & Document;

@Schema({ timestamps: true, collection: 'assets' })
export class Asset {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, unique: true }) assetCode: string;  // AST-001
  @Prop({
    enum: ['furniture', 'it_equipment', 'lab_equipment', 'sports',
           'library', 'vehicle', 'appliance', 'musical_instrument', 'other'],
    required: true,
  })
  category: string;
  @Prop() make: string;
  @Prop() model: string;
  @Prop() serialNumber: string;
  @Prop() purchaseDate: Date;
  @Prop({ default: 0 }) purchasePrice: number;
  @Prop({ default: 0 }) currentValue: number;                // after depreciation
  @Prop({ default: 0 }) depreciationRate: number;            // annual %
  @Prop() warrantyExpiry: Date;
  @Prop() location: string;
  @Prop() campusId: string;
  @Prop() assignedTo: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assignedToId: Types.ObjectId;
  @Prop() departmentId: string;
  @Prop() supplierId: string;
  @Prop({
    enum: ['active', 'maintenance', 'disposed', 'lost', 'stolen'],
    default: 'active',
  })
  status: string;
  @Prop({
    enum: ['excellent', 'good', 'fair', 'poor', 'damaged'],
    default: 'good',
  })
  condition: string;
  @Prop() lastInspectionDate: Date;
  @Prop() nextInspectionDate: Date;
  @Prop() disposalDate: Date;
  @Prop() disposalReason: string;
  @Prop() notes: string;
  @Prop({ type: [String], default: [] }) photos: string[];
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const AssetSchema = SchemaFactory.createForClass(Asset);
AssetSchema.index({ schoolSlug: 1, category: 1, status: 1 });
AssetSchema.pre('validate', async function () {
  if (this.isNew && !this.assetCode) {
    const rand = Math.floor(100 + Math.random() * 900);
    this.assetCode = `AST-${rand}`;
  }
});

// ============================================================
// SCHOOL EVENT
// ============================================================
export type SchoolEventDocument = SchoolEvent & Document;

@Schema({ timestamps: true, collection: 'school_events' })
export class SchoolEvent {
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({
    enum: ['academic', 'sports', 'cultural', 'religious', 'parents',
           'staff', 'exam', 'holiday', 'trip', 'other'],
    required: true,
  })
  category: string;
  @Prop({ required: true }) startDate: Date;
  @Prop() endDate: Date;
  @Prop() startTime: string;
  @Prop() endTime: string;
  @Prop() venue: string;
  @Prop() campusId: string;
  @Prop({ type: [String], default: [] }) targetGrades: string[];
  @Prop({
    enum: ['all', 'students', 'staff', 'parents', 'management'],
    default: 'all',
  })
  audience: string;
  @Prop({
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled', 'postponed'],
    default: 'upcoming',
  })
  status: string;
  @Prop() organizer: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) organizerId: Types.ObjectId;
  @Prop({ default: 0 }) expectedAttendance: number;
  @Prop({ default: 0 }) actualAttendance: number;
  @Prop({ default: 0 }) estimatedBudget: number;
  @Prop({ default: 0 }) actualCost: number;
  @Prop({ default: false }) requiresVehicle: boolean;
  @Prop() vehicleIds: string[];
  @Prop({ default: false }) parentConsent: boolean;
  @Prop({ default: false }) isMandatory: boolean;
  @Prop() notes: string;
  @Prop({ type: [String], default: [] }) attachments: string[];
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const SchoolEventSchema = SchemaFactory.createForClass(SchoolEvent);
SchoolEventSchema.index({ schoolSlug: 1, startDate: 1, status: 1 });
SchoolEventSchema.index({ schoolSlug: 1, category: 1 });

// ── Building ──────────────────────────────────────────────────
// The real foundation for Campus Operations' Buildings tab, which was
// previously running entirely on fake, hardcoded data. Rooms and
// Utilities (both still fake at this point) are meant to build on top
// of this - a Room belongs to a Building, and Utility meter readings
// are typically tracked per Building too.
@Schema({ timestamps: true, collection: 'buildings' })
export class Building {
  @Prop({ required: true }) code: string;
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['Academic', 'Laboratory', 'Administrative', 'Hostel', 'Sports', 'Library', 'Medical', 'Cafeteria'], required: true })
  type: string;
  @Prop({ default: 0 }) floors: number;
  @Prop({ default: 0 }) capacity: number;
  // Real link to whoever manages this building, denormalized name for
  // display - matches the same real-link-plus-denormalized-name pattern
  // already used for Section.classTeacherId/classTeacher.
  @Prop({ type: Types.ObjectId, ref: 'User' }) managerId: Types.ObjectId;
  @Prop() managerName: string;
  @Prop({ enum: ['Compliant', 'Pending', 'Overdue'], default: 'Pending' })
  fireSafety: string;
  @Prop({ enum: ['Active', 'Partial Use', 'Renovation', 'Closed'], default: 'Active' })
  status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const BuildingSchema = SchemaFactory.createForClass(Building);
export type BuildingDocument = Building & Document;
BuildingSchema.index({ schoolSlug: 1, code: 1 }, { unique: true });
BuildingSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// CAMPUS OPERATIONS — ROOM (classroom/lab/office within a Building)
// Distinct from HostelRoom above (hostel-specific, its own occupancy/
// allocation model) - this is a general room inventory: classrooms,
// labs, offices, etc. Real link to Building rather than a free-text
// name, matching the same real-link-plus-denormalized-name pattern used
// throughout Campus Operations (Building.managerId/managerName,
// Section.classTeacherId/classTeacher).
// ============================================================
export type CampusRoomDocument = CampusRoom & Document;

@Schema({ timestamps: true, collection: 'campus_rooms' })
export class CampusRoom {
  @Prop({ required: true }) roomNumber: string;
  @Prop({ type: Types.ObjectId, ref: 'Building', required: true }) buildingId: Types.ObjectId;
  @Prop() buildingName: string;
  @Prop() floor: string;
  @Prop({ enum: ['Classroom', 'Laboratory', 'Office', 'Staff Room', 'Storage', 'Conference Room', 'Auditorium', 'Other'], default: 'Classroom' })
  type: string;
  @Prop({ default: 0 }) capacity: number;
  @Prop() department: string;
  @Prop({ default: false }) isSmart: boolean; // has smart-board/projector/AV equipment
  @Prop({ enum: ['Available', 'Occupied', 'Under Maintenance', 'Reserved'], default: 'Available' })
  availability: string;
  @Prop({ enum: ['Active', 'Inactive'], default: 'Active' }) status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CampusRoomSchema = SchemaFactory.createForClass(CampusRoom);
CampusRoomSchema.index({ schoolSlug: 1, buildingId: 1, roomNumber: 1 }, { unique: true });
CampusRoomSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// CAMPUS OPERATIONS — UTILITY READING
// Meter readings (electricity/water/generator/solar/gas) tracked per
// Building, matching the same real-link pattern as CampusRoom.
// buildingName here is optional/nullable, unlike CampusRoom's required
// link - a reading can genuinely be campus-wide (e.g. solar generation
// serving the whole campus, not one specific building), matching the
// real INIT_UTILITIES sample data seen in the existing frontend (a
// Solar reading with building: "All").
// ============================================================
export type UtilityReadingDocument = UtilityReading & Document;

@Schema({ timestamps: true, collection: 'utility_readings' })
export class UtilityReading {
  @Prop({ enum: ['Electricity', 'Water', 'Generator', 'Solar', 'Gas'], required: true })
  type: string;
  @Prop({ type: Types.ObjectId, ref: 'Building' }) buildingId: Types.ObjectId;
  @Prop() buildingName: string; // "All" / "Campus-wide" when buildingId is not set
  @Prop({ required: true }) previousReading: number;
  @Prop({ required: true }) currentReading: number;
  @Prop() unit: string; // kWh, L, etc.
  @Prop() cost: number;
  @Prop({ required: true }) readingDate: Date;
  @Prop({ enum: ['Normal', 'High Usage', 'Anomaly'], default: 'Normal' })
  status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const UtilityReadingSchema = SchemaFactory.createForClass(UtilityReading);
UtilityReadingSchema.index({ schoolSlug: 1, campusId: 1, readingDate: -1 });
UtilityReadingSchema.index({ schoolSlug: 1, buildingId: 1 });

// ============================================================
// CAMPUS OPERATIONS — VISITOR (security gate log)
// host is deliberately free text, not a real Staff/User link - a
// visitor's stated host is often verbal, given at the gate, and may not
// always correspond to someone in the Staff system (e.g. a parent
// visiting another parent, or someone visiting a specific student
// directly). badge is auto-generated server-side (see generateVisitorBadge
// in the service) rather than trusted from the frontend, to avoid a
// real collision risk if multiple gates check visitors in at once.
// ============================================================
export type VisitorDocument = Visitor & Document;

@Schema({ timestamps: true, collection: 'campus_visitors' })
export class Visitor {
  @Prop({ required: true }) badge: string; // V-0841 - unique per school, see compound index below
  @Prop({ required: true }) name: string;
  @Prop() purpose: string;
  @Prop() phone: string;
  @Prop() cnic: string;
  @Prop() host: string; // who they're visiting - free text, see note above
  @Prop({ required: true }) checkInTime: Date;
  @Prop() checkOutTime: Date;
  @Prop({ enum: ['Inside', 'Checked Out'], default: 'Inside' }) status: string;
  @Prop() campusId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const VisitorSchema = SchemaFactory.createForClass(Visitor);
VisitorSchema.index({ schoolSlug: 1, badge: 1 }, { unique: true });
VisitorSchema.index({ schoolSlug: 1, campusId: 1, checkInTime: -1 });
VisitorSchema.index({ schoolSlug: 1, status: 1 });
