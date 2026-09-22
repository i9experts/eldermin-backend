import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { AccountingConnection, AccountingConnectionDocument, AccountMapping } from './schemas/accounting-connection.schema';
import { AccountingSyncLog, AccountingSyncLogDocument } from './schemas/accounting-sync-log.schema';
import { JournalEntry, JournalEntryDocument } from '../../finance/schemas/ledger.schema';
import { ChartOfAccount, COADocument } from '../../finance/schemas/finance.schema';
import { QuickBooksAdapter } from './adapters/quickbooks.adapter';
import { encryptSecret, decryptSecret } from '../../common/crypto/encryption.util';

const FAILED_RETRY_CAP = 5;
const AUTO_SYNC_BATCH_SIZE = 50;

@Injectable()
export class AccountingIntegrationsService {
  private logger = new Logger('AccountingIntegrationsService');

  constructor(
    @InjectModel(AccountingConnection.name) private connectionModel: Model<AccountingConnectionDocument>,
    @InjectModel(AccountingSyncLog.name) private syncLogModel: Model<AccountingSyncLogDocument>,
    @InjectModel(JournalEntry.name) private journalEntryModel: Model<JournalEntryDocument>,
    @InjectModel(ChartOfAccount.name) private coaModel: Model<COADocument>,
    private quickBooksAdapter: QuickBooksAdapter,
  ) {}

  private sanitize(conn: AccountingConnectionDocument | null) {
    if (!conn) return null;
    const obj = conn.toObject();
    delete obj.accessTokenEnc;
    delete obj.refreshTokenEnc;
    delete obj.pendingStateNonce;
    return obj;
  }

  async getConnection(schoolSlug: string, platform = 'quickbooks_online') {
    const conn = await this.connectionModel.findOne({ schoolSlug, platform });
    return this.sanitize(conn);
  }

  // ─── OAuth connect flow ─────────────────────────────────────────────────
  // The callback below is a PUBLIC route (Intuit redirects the admin's
  // browser there directly, with no Eldermin JWT attached) - schoolSlug and
  // who initiated the connect travel through the OAuth `state` param
  // instead, verified against a short-lived nonce stored on the connection.

  async getConnectUrl(schoolSlug: string, userEmail: string, platform = 'quickbooks_online') {
    if (platform !== 'quickbooks_online') throw new BadRequestException(`Unsupported platform: ${platform}`);
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.connectionModel.findOneAndUpdate(
      { schoolSlug, platform },
      { $set: { pendingStateNonce: nonce, pendingStateExpiresAt: expiresAt } },
      { upsert: true, new: true },
    );
    const state = Buffer.from(JSON.stringify({ schoolSlug, nonce, userEmail })).toString('base64url');
    return { url: this.quickBooksAdapter.getAuthorizationUrl(state) };
  }

  async handleQuickBooksCallback(code: string, state: string, realmId: string) {
    let decoded: { schoolSlug: string; nonce: string; userEmail?: string };
    try {
      decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }
    const { schoolSlug, nonce, userEmail } = decoded;
    const conn = await this.connectionModel.findOne({ schoolSlug, platform: 'quickbooks_online' });
    if (!conn) throw new NotFoundException('No pending QuickBooks connection found for this school');
    if (conn.pendingStateNonce !== nonce || !conn.pendingStateExpiresAt || conn.pendingStateExpiresAt < new Date()) {
      throw new BadRequestException('This QuickBooks connection request has expired - please try connecting again');
    }

    const tokens = await this.quickBooksAdapter.exchangeCodeForTokens(code);
    const connAny = conn as any;
    connAny.realmId = realmId;
    connAny.accessTokenEnc = encryptSecret(tokens.accessToken);
    connAny.refreshTokenEnc = encryptSecret(tokens.refreshToken);
    connAny.tokenExpiresAt = tokens.expiresAt;
    connAny.environment = (process.env.QBO_ENVIRONMENT === 'production') ? 'production' : 'sandbox';
    connAny.status = 'connected';
    connAny.connectedBy = userEmail;
    connAny.connectedAt = new Date();
    connAny.disconnectedAt = undefined;
    connAny.pendingStateNonce = undefined;
    connAny.pendingStateExpiresAt = undefined;
    connAny.lastError = undefined;
    await conn.save();
    return { schoolSlug };
  }

  async disconnect(schoolSlug: string, platform = 'quickbooks_online') {
    const conn = await this.connectionModel.findOne({ schoolSlug, platform });
    if (!conn) throw new NotFoundException('No connection found');
    const connAny = conn as any;
    connAny.status = 'disconnected';
    connAny.accessTokenEnc = undefined;
    connAny.refreshTokenEnc = undefined;
    connAny.disconnectedAt = new Date();
    await conn.save();
    return this.sanitize(conn);
  }

  // ─── Token refresh ──────────────────────────────────────────────────────

  private async ensureValidAccessToken(conn: AccountingConnectionDocument): Promise<string> {
    if (!conn.accessTokenEnc || !conn.refreshTokenEnc) {
      throw new BadRequestException('QuickBooks is not connected for this school');
    }
    const stillValid = conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) > new Date();
    if (stillValid) return decryptSecret(conn.accessTokenEnc);

    const refreshed = await this.quickBooksAdapter.refreshAccessToken(decryptSecret(conn.refreshTokenEnc));
    conn.accessTokenEnc = encryptSecret(refreshed.accessToken);
    conn.refreshTokenEnc = encryptSecret(refreshed.refreshToken);
    conn.tokenExpiresAt = refreshed.expiresAt;
    await conn.save();
    return refreshed.accessToken;
  }

  // ─── Account mapping ────────────────────────────────────────────────────

  async listExternalAccounts(schoolSlug: string) {
    const conn = await this.connectionModel.findOne({ schoolSlug, platform: 'quickbooks_online' });
    if (!conn || conn.status !== 'connected') throw new BadRequestException('QuickBooks is not connected for this school');
    const accessToken = await this.ensureValidAccessToken(conn);
    return this.quickBooksAdapter.listAccounts(conn.realmId, conn.environment, accessToken);
  }

  async listInternalAccounts(schoolSlug: string) {
    return this.coaModel.find({ schoolSlug, isActive: true, isPostable: { $ne: false } }).sort({ code: 1 }).lean();
  }

  async saveAccountMappings(schoolSlug: string, mappings: AccountMapping[]) {
    const conn = await this.connectionModel.findOne({ schoolSlug, platform: 'quickbooks_online' });
    if (!conn) throw new NotFoundException('No connection found for this school');
    conn.accountMappings = mappings;
    await conn.save();
    return this.sanitize(conn);
  }

  async setAutoSync(schoolSlug: string, enabled: boolean) {
    const conn = await this.connectionModel.findOneAndUpdate(
      { schoolSlug, platform: 'quickbooks_online' },
      { $set: { autoSyncEnabled: enabled } },
      { new: true },
    );
    if (!conn) throw new NotFoundException('No connection found for this school');
    return this.sanitize(conn);
  }

  // ─── Sync ───────────────────────────────────────────────────────────────

  async getSyncLogs(schoolSlug: string, limit = 100) {
    return this.syncLogModel.find({ schoolSlug }).sort({ updatedAt: -1 }).limit(limit).lean();
  }

  async syncNow(schoolSlug: string) {
    const conn = await this.connectionModel.findOne({ schoolSlug, platform: 'quickbooks_online' });
    if (!conn || conn.status !== 'connected') throw new BadRequestException('QuickBooks is not connected for this school');
    return this.syncPendingForConnection(conn, { force: true, limit: 200 });
  }

  async retryOne(schoolSlug: string, syncLogId: string) {
    const conn = await this.connectionModel.findOne({ schoolSlug, platform: 'quickbooks_online' });
    if (!conn || conn.status !== 'connected') throw new BadRequestException('QuickBooks is not connected for this school');
    const log = await this.syncLogModel.findOne({ _id: syncLogId, schoolSlug });
    if (!log) throw new NotFoundException('Sync log entry not found');
    const entry = await this.journalEntryModel.findById(log.journalEntryId).lean();
    if (!entry) throw new NotFoundException('The underlying journal entry no longer exists');
    const accessToken = await this.ensureValidAccessToken(conn);
    await this.syncOneEntry(conn, accessToken, entry as any);
    return this.syncLogModel.findById(log._id).lean();
  }

  // Runs every minute for every connected+auto-sync-enabled school - this is
  // the "real-time" half of the sync (near-real-time via short polling,
  // rather than hooking directly into FinanceService, which stays entirely
  // unaware this module exists).
  @Cron(CronExpression.EVERY_MINUTE)
  async autoSyncAll() {
    const connections = await this.connectionModel.find({ status: 'connected', autoSyncEnabled: true });
    for (const conn of connections) {
      try {
        await this.syncPendingForConnection(conn, { force: false, limit: AUTO_SYNC_BATCH_SIZE });
      } catch (e: any) {
        this.logger.error(`Auto-sync failed for ${conn.schoolSlug}: ${e?.message}`);
      }
    }
  }

  private async syncPendingForConnection(conn: AccountingConnectionDocument, opts: { force: boolean; limit: number }) {
    const successIds = await this.syncLogModel.find({ connectionId: conn._id, status: 'success' }).distinct('journalEntryId');
    const excludeIds = [...successIds];
    if (!opts.force) {
      const blockedIds = await this.syncLogModel
        .find({ connectionId: conn._id, status: 'failed', attempts: { $gte: FAILED_RETRY_CAP } })
        .distinct('journalEntryId');
      excludeIds.push(...blockedIds);
    }

    const pending = await this.journalEntryModel
      .find({ schoolSlug: conn.schoolSlug, status: 'posted', _id: { $nin: excludeIds } })
      .sort({ createdAt: 1 })
      .limit(opts.limit)
      .lean();

    if (pending.length === 0) return { synced: 0, failed: 0, errors: [] as string[] };

    const accessToken = await this.ensureValidAccessToken(conn);
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const entry of pending) {
      try {
        await this.syncOneEntry(conn, accessToken, entry as any);
        synced++;
      } catch (e: any) {
        failed++;
        errors.push(`${(entry as any).entryNo}: ${e?.message}`);
      }
    }

    conn.lastSyncedAt = new Date();
    conn.lastError = errors[errors.length - 1];
    await conn.save();

    return { synced, failed, errors };
  }

  private async syncOneEntry(conn: AccountingConnectionDocument, accessToken: string, entry: JournalEntry & { _id: any }) {
    try {
      const lines = entry.lines.map((line: any) => {
        const mapping = conn.accountMappings.find((m) => m.accountCode === line.accountCode);
        if (!mapping) {
          throw new BadRequestException(
            `Account ${line.accountCode} (${line.accountName}) is not mapped to a QuickBooks account - map it in Accounting Integrations settings before this entry can sync.`,
          );
        }
        return {
          accountExternalId: mapping.externalAccountId,
          accountName: mapping.externalAccountName,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.partnerName || entry.narration || entry.entryNo,
        };
      });

      const externalId = await this.quickBooksAdapter.createJournalEntry(conn.realmId, conn.environment, accessToken, {
        txnDate: new Date(entry.date),
        privateNote: `Eldermin ${entry.entryNo}${entry.narration ? ` - ${entry.narration}` : ''}`,
        lines,
      });

      await this.syncLogModel.findOneAndUpdate(
        { connectionId: conn._id, journalEntryId: entry._id },
        {
          $set: { schoolSlug: conn.schoolSlug, entryNo: entry.entryNo, status: 'success', externalId, errorMessage: undefined, lastAttemptAt: new Date() },
          $inc: { attempts: 1 },
        },
        { upsert: true },
      );
    } catch (e: any) {
      await this.syncLogModel.findOneAndUpdate(
        { connectionId: conn._id, journalEntryId: entry._id },
        {
          $set: { schoolSlug: conn.schoolSlug, entryNo: entry.entryNo, status: 'failed', errorMessage: e?.message || 'Unknown error', lastAttemptAt: new Date() },
          $inc: { attempts: 1 },
        },
        { upsert: true },
      );
      throw e;
    }
  }
}
