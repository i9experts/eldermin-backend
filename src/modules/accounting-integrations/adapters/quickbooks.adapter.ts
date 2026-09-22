import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';

// Thin wrapper over the QuickBooks Online (Intuit) OAuth2 + REST API.
// Deliberately has no Mongo/NestJS-DI awareness of AccountingConnection -
// it takes/returns plain tokens and ids so it stays testable and so a
// second platform (ERPNext etc.) can be added later as a sibling adapter
// without this one growing extra branches.
//
// Setup required at the Intuit Developer portal (developer.intuit.com):
// register an app, grab QBO_CLIENT_ID/QBO_CLIENT_SECRET, and add
// {BACKEND_URL}/academics/accounting-integrations/quickbooks/callback as
// an allowed Redirect URI.

const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE = 'com.intuit.quickbooks.accounting';
const MINOR_VERSION = '65';

export interface QboTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface QboJournalLine {
  accountExternalId: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

@Injectable()
export class QuickBooksAdapter {
  private clientId() {
    const v = process.env.QBO_CLIENT_ID;
    if (!v) throw new BadRequestException('QuickBooks integration is not configured on this server (QBO_CLIENT_ID missing)');
    return v;
  }
  private clientSecret() {
    const v = process.env.QBO_CLIENT_SECRET;
    if (!v) throw new BadRequestException('QuickBooks integration is not configured on this server (QBO_CLIENT_SECRET missing)');
    return v;
  }
  private redirectUri() {
    const backendUrl = process.env.BACKEND_URL || 'https://api.eldermin.com';
    return `${backendUrl}/academics/accounting-integrations/quickbooks/callback`;
  }
  private apiBase(realmId: string, environment: string) {
    const host = environment === 'production' ? 'quickbooks.api.intuit.com' : 'sandbox-quickbooks.api.intuit.com';
    return `https://${host}/v3/company/${realmId}`;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId(),
      response_type: 'code',
      scope: SCOPE,
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${AUTH_BASE}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<QboTokens> {
    return this.requestTokens({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri() });
  }

  async refreshAccessToken(refreshToken: string): Promise<QboTokens> {
    return this.requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async requestTokens(body: Record<string, string>): Promise<QboTokens> {
    const basicAuth = Buffer.from(`${this.clientId()}:${this.clientSecret()}`).toString('base64');
    try {
      const { data } = await axios.post(TOKEN_URL, new URLSearchParams(body).toString(), {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        // QBO access tokens are valid 1hr; refresh a little early to avoid
        // a request landing right on the expiry boundary.
        expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
      };
    } catch (e: any) {
      throw new BadRequestException(`QuickBooks token request failed: ${e?.response?.data?.error_description || e?.message}`);
    }
  }

  async listAccounts(realmId: string, environment: string, accessToken: string): Promise<Array<{ id: string; name: string; type: string }>> {
    const query = encodeURIComponent('SELECT Id, Name, AccountType, Active FROM Account WHERE Active = true MAXRESULTS 1000');
    const url = `${this.apiBase(realmId, environment)}/query?query=${query}&minorversion=${MINOR_VERSION}`;
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      const rows = data?.QueryResponse?.Account ?? [];
      return rows.map((a: any) => ({ id: a.Id, name: a.Name, type: a.AccountType }));
    } catch (e: any) {
      throw new BadRequestException(`Failed to fetch QuickBooks accounts: ${e?.response?.data?.Fault?.Error?.[0]?.Message || e?.message}`);
    }
  }

  async createJournalEntry(
    realmId: string,
    environment: string,
    accessToken: string,
    params: { txnDate: Date; privateNote: string; lines: QboJournalLine[] },
  ): Promise<string> {
    const body = {
      TxnDate: params.txnDate.toISOString().slice(0, 10),
      PrivateNote: params.privateNote,
      Line: params.lines.map((l) => ({
        Amount: l.debit || l.credit,
        DetailType: 'JournalEntryLineDetail',
        Description: l.description,
        JournalEntryLineDetail: {
          PostingType: l.debit ? 'Debit' : 'Credit',
          AccountRef: { value: l.accountExternalId, name: l.accountName },
        },
      })),
    };
    const url = `${this.apiBase(realmId, environment)}/journalentry?minorversion=${MINOR_VERSION}`;
    try {
      const { data } = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      return data?.JournalEntry?.Id;
    } catch (e: any) {
      const qboError = e?.response?.data?.Fault?.Error?.[0];
      throw new BadRequestException(`QuickBooks rejected the journal entry: ${qboError?.Message || e?.message}${qboError?.Detail ? ` — ${qboError.Detail}` : ''}`);
    }
  }
}
