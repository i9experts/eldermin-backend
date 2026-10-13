import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../organization/schemas/user.schema';
import { AuthStateService } from './auth-state.service';

/** Self-contained so AuthModule, AccountAccessModule and HrModule share ONE cache instance. */
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [AuthStateService],
  exports: [AuthStateService],
})
export class AuthStateModule {}
