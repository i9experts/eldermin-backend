// Redaction for audit before/after snapshots. Pure and dependency-free.
// Rules: secrets (passwords, hashes, tokens, otp) -> '[REDACTED]'; bank
// account / IBAN / national-ID / CNIC style values -> '****' + last 4;
// anything under identityDocs / bankDetails is masked leaf by leaf.

const SECRET_KEY = /(pass(word)?|hash|token|secret|otp|apikey|api_key|authorization|cvv)/i;
const SENSITIVE_NUMBER_KEY = /(iban|account(number|no|num)?|acct|cnic|nic|national|passport|identity|swift|routing|sortcode|taxid|ssn)/i;
const SENSITIVE_PARENT_KEY = /^(identityDocs|bankDetails|bank|identity)$/i;
const CNIC = /^\d{5}-?\d{7}-?\d$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

export const MAX_AUDIT_VALUE_CHARS = 8000;

function maskLast4(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return s;
  return '****' + s.slice(-4);
}

export function maskSensitive(value: any, parentSensitive = false, depth = 0): any {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[TRUNCATED]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(v => maskSensitive(v, parentSensitive, depth + 1));
  if (typeof value === 'object') {
    // ObjectId / Decimal128 / mongoose docs -> plain
    if (typeof (value as any).toHexString === 'function') return (value as any).toHexString();
    const plain = typeof (value as any).toObject === 'function' ? (value as any).toObject() : value;
    const out: any = {};
    for (const [k, v] of Object.entries(plain)) {
      if (SECRET_KEY.test(k)) { out[k] = '[REDACTED]'; continue; }
      out[k] = maskSensitive(v, parentSensitive || SENSITIVE_PARENT_KEY.test(k) || SENSITIVE_NUMBER_KEY.test(k), depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value);
    if (parentSensitive || CNIC.test(s) || IBAN.test(s.replace(/\s/g, ''))) return maskLast4(s);
    return value;
  }
  return value;
}

/** JSON string of the masked value, capped so one entry cannot bloat the collection. */
export function toAuditString(value: any): string | undefined {
  if (value === undefined) return undefined;
  let s: string;
  try { s = JSON.stringify(maskSensitive(value)); } catch { s = '"[UNSERIALIZABLE]"'; }
  if (s && s.length > MAX_AUDIT_VALUE_CHARS) s = s.slice(0, MAX_AUDIT_VALUE_CHARS) + '…[TRUNCATED]';
  return s;
}
