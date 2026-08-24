import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResellersController } from './resellers.controller';
import { ResellerPortalController } from './reseller-portal.controller';
import { ResellersService } from './resellers.service';
import { Reseller, ResellerSchema } from './schemas/reseller.schema';
import { CommissionPosting, CommissionPostingSchema } from './schemas/commission-posting.schema';
import { ProvisioningRequest, ProvisioningRequestSchema } from './schemas/provisioning-request.schema';
import { DealRegistration, DealRegistrationSchema } from './schemas/deal-registration.schema';
import {
  Institution,
  InstitutionSchema,
} from '../super-admin/schemas/super-admin.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { FinanceModule } from '../finance/finance.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    SuperAdminModule, // for SuperAdminService.createInstitution (reused by provisionInstitution)
    FinanceModule, // for the Commission & Billing Engine's ledger postings
    EmailModule, // for Reseller Portal invite emails
    MongooseModule.forFeature([
      { name: Reseller.name, schema: ResellerSchema },
      { name: Institution.name, schema: InstitutionSchema },
      { name: CommissionPosting.name, schema: CommissionPostingSchema },
      { name: ProvisioningRequest.name, schema: ProvisioningRequestSchema },
      { name: DealRegistration.name, schema: DealRegistrationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ResellersController, ResellerPortalController],
  providers: [ResellersService],
  exports: [ResellersService],
})
export class ResellersModule {}
