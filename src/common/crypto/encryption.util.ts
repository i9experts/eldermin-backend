import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// AES-256-GCM at-rest encryption for third-party OAuth tokens (QuickBooks
// access/refresh tokens etc.) - the first real secret-encryption need in
// this codebase (see PaymentGatewayConfig.credentialsRef, which is
// explicitly a placeholder, not real storage). ENCRYPTION_KEY can be any
// length string - scrypt derives a proper 32-byte key from it so ops
// doesn't need to generate/manage a raw key by hand.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce size for GCM

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not set - required to store/read encrypted integration credentials');
  }
  // Fixed salt is acceptable here: this derives one static app-wide key
  // from one static app-wide secret, not a per-user password hash.
  return scryptSync(secret, 'eldermin-encryption-salt', 32);
}

// Returns "iv:authTag:ciphertext", all hex - a single string so it drops
// straight into one Mongo string field.
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(encoded: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted value');
  }
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
