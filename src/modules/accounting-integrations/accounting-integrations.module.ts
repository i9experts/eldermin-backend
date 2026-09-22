import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountingIntegrationsController } from './accounting-integrations.controller';
import { AccountingIntegrationsService } from './accounting-integrations.service';
import { QuickBooksAdapter } from './adapters/quickbooks.adapter';
import { AccountingConnection, AccountingConnectionSchema } from './schemas/accounting-connection.schema';
import { AccountingSyncLog, AccountingSyncLogSchema } from './schemas/accounting-sync-log.schema';
import { JournalEntry, JournalEntrySchema } from '../../finance/schemas/ledger.schema';
import { ChartOfAccount, COASchema } from '../../finance/schemas/finance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AccountingConnection.name, schema: AccountingConnectionSchema },
      { name: AccountingSyncLog.name, schema: AccountingSyncLogSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: ChartOfAccount.name, schema: COASchema },
    ]),
  ],
  controllers: [AccountingIntegrationsController],
  providers: [AccountingIntegrationsService, QuickBooksAdapter],
  exports: [AccountingIntegrationsService],
})
export class AccountingIntegrationsModule {}
