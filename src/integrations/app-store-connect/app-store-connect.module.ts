import { Module } from '@nestjs/common';
import { AppStoreConnectService } from './app-store-connect.service';

@Module({
  providers: [AppStoreConnectService],
  exports: [AppStoreConnectService],
})
export class AppStoreConnectModule {}
