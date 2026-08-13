import { Injectable, Logger } from '@nestjs/common';

// Real WhatsApp Business API (Meta Cloud API) integration. Sends
// business-initiated messages using pre-approved templates, as WhatsApp
// requires - a template must exist and be approved in Meta Business
// Manager under the exact name passed to sendTemplateMessage before a
// real send will succeed; until WABA_PHONE_NUMBER_ID/WABA_ACCESS_TOKEN
// are set, this honestly reports that nothing was sent rather than
// pretending to.
@Injectable()
export class WhatsAppService {
  private logger = new Logger('WhatsAppService');
  private readonly apiVersion = 'v19.0';

  private isConfigured(): boolean {
    return !!(process.env.WABA_PHONE_NUMBER_ID && process.env.WABA_ACCESS_TOKEN);
  }

  /**
   * Sends a pre-approved WhatsApp template message. `params` are
   * applied positionally to the template's numbered placeholders
   * ({{1}}, {{2}}, ...) in the order Object.values() gives them - so
   * callers should build `params` as an ordered object matching the
   * template's actual placeholder order.
   */
  async sendTemplateMessage(to: string, templateName: string, params: Record<string, string>): Promise<{ sent: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp send attempted but WABA_PHONE_NUMBER_ID/WABA_ACCESS_TOKEN are not set — nothing was sent.');
      return { sent: false, reason: 'WhatsApp Business API is not connected yet. Set up a WABA account (directly with Meta, or via a provider like Twilio/360dialog/Gupshup) and add the credentials to enable this.' };
    }

    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const accessToken = process.env.WABA_ACCESS_TOKEN;
    // Meta requires the recipient number without a leading '+' in the
    // 'to' field, even though it wants full E.164 digits otherwise.
    const toDigitsOnly = to.replace(/[^\d]/g, '');

    const components = Object.keys(params).length > 0
      ? [{ type: 'body', parameters: Object.values(params).map((value) => ({ type: 'text', text: String(value) })) }]
      : undefined;

    try {
      const response = await fetch(`https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toDigitsOnly,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en_US' },
            ...(components ? { components } : {}),
          },
        }),
      });

      const body: any = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = body?.error?.message || `WhatsApp API returned HTTP ${response.status}`;
        this.logger.error(`WhatsApp send failed for template "${templateName}" to ${to}: ${errorMessage}`);
        return { sent: false, reason: errorMessage };
      }

      this.logger.log(`WhatsApp template "${templateName}" sent to ${to} (message id: ${body?.messages?.[0]?.id || 'unknown'})`);
      return { sent: true };
    } catch (err: any) {
      this.logger.error(`WhatsApp send threw an error for template "${templateName}" to ${to}: ${err.message}`);
      return { sent: false, reason: `Network or unexpected error: ${err.message}` };
    }
  }
}
