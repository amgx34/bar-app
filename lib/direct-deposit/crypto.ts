/**
 * AES-256-GCM encryption and HMAC-SHA256 OTP utilities.
 * All operations are synchronous and run server-side only.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';

// ── Key management ────────────────────────────────────────────────────────────

function getKey(): Buffer {
  const b64 = process.env.DD_ENCRYPTION_KEY;
  if (!b64) throw new Error('DD_ENCRYPTION_KEY is not set in environment variables.');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32)
    throw new Error('DD_ENCRYPTION_KEY must be exactly 32 bytes (256-bit). Regenerate it.');
  return key;
}

// ── AES-256-GCM ───────────────────────────────────────────────────────────────
// Layout: nonce(12) | authTag(16) | ciphertext(variable)

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(12);                          // unique per call
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(token: string): string {
  const key  = getKey();
  const data = Buffer.from(token, 'base64');
  if (data.length < 28) throw new Error('Ciphertext too short — may be corrupted.');
  const iv         = data.subarray(0, 12);
  const tag        = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher   = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Decryption failed — ciphertext may be tampered or key may be wrong.');
  }
}

export function encryptJSON(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}

export function decryptJSON<T = unknown>(token: string): T {
  return JSON.parse(decrypt(token)) as T;
}

// ── OTP generation & hashing ──────────────────────────────────────────────────

export function generateOTP(): string {
  // randomInt is cryptographically secure (uses crypto.randomInt)
  return String(randomInt(100_000, 999_999));
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

export function hashOTP(code: string, salt: string): string {
  return createHmac('sha256', salt).update(code).digest('hex');
}

/** Constant-time comparison — prevents timing oracle attacks. */
export function verifyOTP(code: string, salt: string, storedHash: string): boolean {
  try {
    const expected = hashOTP(code, salt);
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function maskAccount(accountNumber: string): string {
  return accountNumber.slice(-4).padStart(4, '0');
}

/** NACHA ABA routing number checksum validation. */
export function validateRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const checksum =
    (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10;
  return checksum === 0;
}
