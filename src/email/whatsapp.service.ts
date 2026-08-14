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
   *
   * `isAuthTemplate` must be true for Authentication-category templates
   * using the "Copy Code" delivery method (e.g. parent_login_otp) -
   * Meta requires those to carry the code in BOTH the body parameter
   * AND a separate button component with sub_type 'copy_code'. A
   * regular Utility template (e.g. fee_reminder) doesn't need this and
   * would be rejected by Meta if it were added, so this only applies
   * when explicitly requested.
   */
  async sendTemplateMessage(
    to: string, templateName: string, params: Record<string, string>,
    options?: { isAuthTemplate?: boolean },
  ): Promise<{ sent: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp send attempted but WABA_PHONE_NUMBER_ID/WABA_ACCESS_TOKEN are not set — nothing was sent.');
      return { sent: false, reason: 'WhatsApp Business API is not connected yet. Set up a WABA account (directly with Meta, or via a provider like Twilio/360dialog/Gupshup) and add the credentials to enable this.' };
    }

    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const accessToken = process.env.WABA_ACCESS_TOKEN;
    // Meta requires the recipient number without a leading '+' in the
    // 'to' field, even though it wants full E.164 digits otherwise.
    const toDigitsOnly = to.replace(/[^\d]/g, '');
    const paramValues = Object.values(params).map((value) => String(value));

    const components: any[] = [];
    if (paramValues.length > 0) {
      components.push({ type: 'body', parameters: paramValues.map((value) => ({ type: 'text', text: value })) });
    }
    if (options?.isAuthTemplate) {
      // The code is always the first (and normally only) param for an
      // auth template - copied into the button component as Meta's
      // copy-code delivery method requires.
      const code = paramValues[0];
      components.push({ type: 'button', sub_type: 'copy_code', index: 0, parameters: [{ type: 'coupon_code', coupon_code: code }] });
    }

    // Language code as actually registered on the template in WhatsApp
    // Manager - configurable since Meta's "English" option in the UI
    // maps to the plain 'en' code, not 'en_US', and getting this wrong
    // causes a "template not found" style failure that looks like a
    // missing template rather than a language mismatch.
    const languageCode = process.env.WABA_TEMPLATE_LANGUAGE || 'en';

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
            language: { code: languageCode },
            ...(components.length > 0 ? { components } : {}),
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
