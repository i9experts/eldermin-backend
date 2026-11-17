import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppVersion, AppVersionSchema } from './schemas/app-version.schema';
import { AppVersionService } from './app-version.service';
import { AppVersionAdminController, AppVersionPublicController } from './app-version.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: AppVersion.name, schema: AppVersionSchema }])],
  controllers: [AppVersionPublicController, AppVersionAdminController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
