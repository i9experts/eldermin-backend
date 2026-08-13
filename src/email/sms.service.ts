import { Injectable, Logger } from '@nestjs/common';

// No real SMS gateway integration exists yet - sending an actual SMS
// requires a genuine account with a provider (Twilio, Telesign, or a
// local Pakistani aggregator like Telenor/Jazz's SMS API, or a
// multi-channel provider), plus a registered sender ID in most
// jurisdictions - an external account-setup process, not something that
// can be coded into existence from here. This is intentionally built as
// a real integration point: once SMS_GATEWAY_* env vars are set, wiring
// in the actual API call is a small, contained change - but until then,
// this honestly reports that nothing was actually sent rather than
// pretending to, matching the same pattern as whatsapp.service.ts.
@Injectable()
export class SmsService {
  private logger = new Logger('SmsService');

  private isConfigured(): boolean {
    return !!(process.env.SMS_GATEWAY_API_KEY && process.env.SMS_GATEWAY_SENDER_ID);
  }

  async sendSms(_to: string, _message: string): Promise<{ sent: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('SMS send attempted but SMS_GATEWAY_API_KEY/SMS_GATEWAY_SENDER_ID are not set - nothing was sent.');
      return { sent: false, reason: 'SMS gateway is not connected yet. Set up an account with a provider (e.g. Twilio, or a local aggregator) and add the credentials to enable this.' };
    }
    // Real integration goes here once SMS_GATEWAY_* env vars exist - e.g.
    // a POST to the provider's send-message endpoint with _to and _message.
    return { sent: false, reason: 'SMS credentials are set but the send call itself has not been implemented yet - contact support to finish wiring this up.' };
  }
}
