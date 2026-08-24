import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResellersController } from './resellers.controller';
import { ResellersService } from './resellers.service';
import { Reseller, ResellerSchema } from './schemas/reseller.schema';
import {
  Institution,
  InstitutionSchema,
} from '../super-admin/schemas/super-admin.schema';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    SuperAdminModule, // for SuperAdminService.createInstitution (reused by provisionInstitution)
    MongooseModule.forFeature([
      { name: Reseller.name, schema: ResellerSchema },
      { name: Institution.name, schema: InstitutionSchema },
    ]),
  ],
  controllers: [ResellersController],
  providers: [ResellersService],
  exports: [ResellersService],
})
export class ResellersModule {}
