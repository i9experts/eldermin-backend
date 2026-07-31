import { Injectable, Logger } from '@nestjs/common';

// No real WhatsApp Business API (WABA) integration exists yet — sending an
// actual WhatsApp message requires a genuine, Meta-approved business account
// (either directly via Meta's Cloud API, or through a Business Solution
// Provider like Twilio, 360dialog, or Gupshup), plus pre-approved message
// templates, which is an external account-setup process that takes days to
// go through Meta's own review — not something that can be coded into
// existence from here. This is intentionally built as a real integration
// point: once WABA_* env vars are set, wiring in the actual API call is a
// small, contained change — but until then, this honestly reports that
// nothing was actually sent rather than pretending to.
@Injectable()
export class WhatsAppService {
  private logger = new Logger('WhatsAppService');
  private isConfigured(): boolean {
    return !!(process.env.WABA_PHONE_NUMBER_ID && process.env.WABA_ACCESS_TOKEN);
  }

  async sendTemplateMessage(_to: string, _templateName: string, _params: Record<string, string>): Promise<{ sent: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp send attempted but WABA_PHONE_NUMBER_ID/WABA_ACCESS_TOKEN are not set — nothing was sent.');
      return { sent: false, reason: 'WhatsApp Business API is not connected yet. Set up a WABA account (directly with Meta, or via a provider like Twilio/360dialog/Gupshup) and add the credentials to enable this.' };
    }
    // Real integration goes here once WABA_* env vars exist — e.g. a POST to
    // https://graph.facebook.com/v19.0/{WABA_PHONE_NUMBER_ID}/messages with
    // an approved template name and its parameters.
    return { sent: false, reason: 'WhatsApp credentials are set but the send call itself has not been implemented yet — contact support to finish wiring this up.' };
  }
}
