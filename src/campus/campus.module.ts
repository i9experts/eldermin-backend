import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampusController } from './campus.controller';
import { CampusService } from './campus.service';
import {
  Vehicle, VehicleSchema,
  TransportRoute, TransportRouteSchema,
  StudentTransport, StudentTransportSchema,
  HostelBlock, HostelBlockSchema,
  HostelRoom, HostelRoomSchema,
  HostelAllocation, HostelAllocationSchema,
  MaintenanceRequest, MaintenanceRequestSchema,
  Asset, AssetSchema,
  SchoolEvent, SchoolEventSchema,
  Building, BuildingSchema,
  CampusRoom, CampusRoomSchema,
  UtilityReading, UtilityReadingSchema,
  Visitor, VisitorSchema,
} from './campus.schema';

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
      { name: Building.name, schema: BuildingSchema },
      { name: CampusRoom.name, schema: CampusRoomSchema },
      { name: UtilityReading.name, schema: UtilityReadingSchema },
      { name: Visitor.name, schema: VisitorSchema },
    ]),
  ],
  controllers: [CampusController],
  providers: [CampusService],
  exports: [CampusService],
})
export class CampusModule {}
