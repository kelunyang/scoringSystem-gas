/**
 * TOTP (Time-based One-Time Password) Implementation
 * RFC 6238 compliant, using Web Crypto API (Cloudflare Workers compatible)
 *
 * Used for Google Authenticator / TOTP app integration
 */

import { constantTimeCompare } from '@repo/shared/utils/secure-compare';

// ─── Base32 Encoding/Decoding (RFC 4648) ───

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a Uint8Array to Base32 string
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode a Base32 string to Uint8Array
 */
export function base32Decode(encoded: string): Uint8Array {
  const cleanInput = encoded.replace(/=+$/, '').toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleanInput[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

// ─── TOTP Core ───

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;

/**
 * Generate a cryptographically secure TOTP secret (20 bytes = 160 bits)
 * Returns Base32-encoded string suitable for otpauth:// URIs
 */
export function generateTotpSecret(): string {
  const buffer = new Uint8Array(20);
  crypto.getRandomValues(buffer);
  return base32Encode(buffer);
}

/**
 * Generate a TOTP code for a given secret and time
 * Implements RFC 4226 HOTP with RFC 6238 time-based counter
 */
export async function generateTotpCode(
  secret: string,
  timeStepOffset: number = 0
): Promise<string> {
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TOTP_PERIOD) + timeStepOffset;

  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(0, Math.floor(counter / 0x100000000));
  counterView.setUint32(4, counter & 0xffffffff);

  // HMAC-SHA1
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);

  // Dynamic truncation (RFC 4226 Section 5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Verify a TOTP code with configurable time window
 * Allows ±window steps to handle clock skew (default: ±1 = 90 seconds total)
 *
 * Uses constant-time comparison to prevent timing attacks
 */
export async function verifyTotpCode(
  secret: string,
  inputCode: string,
  window: number = 1
): Promise<boolean> {
  // Strict format check: must be exactly 6 digits
  if (!/^\d{6}$/.test(inputCode)) {
    return false;
  }

  for (let i = -window; i <= window; i++) {
    const expectedCode = await generateTotpCode(secret, i);
    if (constantTimeCompare(inputCode, expectedCode)) {
      return true;
    }
  }

  return false;
}

// ─── OTPAuth URI ───

/**
 * Build an otpauth:// URI for QR code scanning
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */
export function buildOtpauthUri(
  email: string,
  secret: string,
  issuer: string = 'ScoringSystem'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

// ─── Recovery Codes ───

const RECOVERY_CODE_LENGTH = 8;
const RECOVERY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I,O,0,1 for readability

/**
 * Generate recovery codes with their SHA-256 hashes
 * Returns plaintext codes (shown once to user) and hashes (stored in DB)
 */
export async function generateRecoveryCodes(
  count: number = 10
): Promise<{ codes: string[]; hashes: string[] }> {
  const codes: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate random code
    const bytes = new Uint8Array(RECOVERY_CODE_LENGTH);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += RECOVERY_CODE_CHARS[bytes[j] % RECOVERY_CODE_CHARS.length];
    }
    codes.push(code);

    // Hash with SHA-256
    const hash = await hashRecoveryCode(code);
    hashes.push(hash);
  }

  return { codes, hashes };
}

/**
 * Hash a recovery code with SHA-256
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code.toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a recovery code against a stored SHA-256 hash
 * Uses constant-time comparison
 */
export async function verifyRecoveryCode(
  inputCode: string,
  storedHash: string
): Promise<boolean> {
  const inputHash = await hashRecoveryCode(inputCode);
  return constantTimeCompare(inputHash, storedHash);
}
