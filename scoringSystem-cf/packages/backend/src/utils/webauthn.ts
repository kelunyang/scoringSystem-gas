/**
 * WebAuthn (Passkey/FIDO2) Implementation
 * W3C Web Authentication API compliant, using Web Crypto API (Cloudflare Workers compatible)
 *
 * Used for Passkey authentication (biometric/hardware key 2FA)
 */

import { constantTimeCompare } from '@repo/shared/utils/secure-compare';

// ─── Base64URL Encoding/Decoding (RFC 4648 Section 5) ───

/**
 * Encode a Uint8Array to Base64URL string (no padding)
 */
export function bufferToBase64Url(buffer: Uint8Array | ArrayBuffer): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a Base64URL string to Uint8Array
 */
export function base64UrlToBuffer(base64url: string): Uint8Array {
  // Add padding if needed
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Challenge Generation ───

const CHALLENGE_SIZE = 32; // 256 bits

/**
 * Generate a cryptographically secure random challenge
 * Returns Base64URL-encoded string
 */
export function generateChallenge(): string {
  const buffer = new Uint8Array(CHALLENGE_SIZE);
  crypto.getRandomValues(buffer);
  return bufferToBase64Url(buffer);
}

// ─── CBOR Decoding (Minimal implementation for WebAuthn) ───

/**
 * Minimal CBOR decoder for WebAuthn attestation objects
 * Supports: maps, byte strings, text strings, unsigned integers, arrays
 */
export function decodeCbor(buffer: Uint8Array): any {
  let offset = 0;

  function readByte(): number {
    if (offset >= buffer.length) {
      throw new Error('CBOR: Unexpected end of data');
    }
    return buffer[offset++];
  }

  function readBytes(length: number): Uint8Array {
    if (offset + length > buffer.length) {
      throw new Error('CBOR: Unexpected end of data');
    }
    const bytes = buffer.slice(offset, offset + length);
    offset += length;
    return bytes;
  }

  function readLength(additionalInfo: number): number {
    if (additionalInfo < 24) {
      return additionalInfo;
    } else if (additionalInfo === 24) {
      return readByte();
    } else if (additionalInfo === 25) {
      const bytes = readBytes(2);
      return (bytes[0] << 8) | bytes[1];
    } else if (additionalInfo === 26) {
      const bytes = readBytes(4);
      return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    } else if (additionalInfo === 27) {
      // 8-byte length - JavaScript can't handle this accurately
      const bytes = readBytes(8);
      // Only use lower 4 bytes (should be enough for our use case)
      return (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
    }
    throw new Error(`CBOR: Invalid additional info: ${additionalInfo}`);
  }

  function decode(): any {
    const byte = readByte();
    const majorType = byte >> 5;
    const additionalInfo = byte & 0x1f;

    switch (majorType) {
      case 0: // Unsigned integer
        return readLength(additionalInfo);

      case 1: // Negative integer
        return -1 - readLength(additionalInfo);

      case 2: // Byte string
        const byteLength = readLength(additionalInfo);
        return readBytes(byteLength);

      case 3: // Text string
        const textLength = readLength(additionalInfo);
        const textBytes = readBytes(textLength);
        return new TextDecoder().decode(textBytes);

      case 4: // Array
        const arrayLength = readLength(additionalInfo);
        const array: any[] = [];
        for (let i = 0; i < arrayLength; i++) {
          array.push(decode());
        }
        return array;

      case 5: // Map
        const mapLength = readLength(additionalInfo);
        const map: Record<string, any> = {};
        for (let i = 0; i < mapLength; i++) {
          const key = decode();
          const value = decode();
          map[String(key)] = value;
        }
        return map;

      case 7: // Special (true, false, null, etc.)
        if (additionalInfo === 20) return false;
        if (additionalInfo === 21) return true;
        if (additionalInfo === 22) return null;
        throw new Error(`CBOR: Unknown special value: ${additionalInfo}`);

      default:
        throw new Error(`CBOR: Unknown major type: ${majorType}`);
    }
  }

  return decode();
}

// ─── Authenticator Data Parsing ───

export interface AuthenticatorData {
  rpIdHash: Uint8Array;           // SHA-256 hash of RP ID (32 bytes)
  flags: {
    userPresent: boolean;         // UP flag
    userVerified: boolean;        // UV flag
    backupEligible: boolean;      // BE flag (attestedCredentialData backup eligible)
    backupState: boolean;         // BS flag (credential backed up/synced)
    attestedCredentialData: boolean; // AT flag
    extensionData: boolean;       // ED flag
  };
  signCount: number;              // 4-byte big-endian counter
  // Only present if flags.attestedCredentialData is true:
  aaguid?: Uint8Array;            // 16-byte AAGUID
  credentialId?: Uint8Array;      // Variable length credential ID
  credentialPublicKey?: Uint8Array; // COSE public key
}

/**
 * Parse authenticator data from attestation/assertion response
 * @param authData Raw authenticator data bytes
 * @param includeCredential Whether to parse attested credential data (registration only)
 */
export function parseAuthenticatorData(
  authData: Uint8Array,
  includeCredential: boolean = true
): AuthenticatorData {
  if (authData.length < 37) {
    throw new Error('Authenticator data too short');
  }

  let offset = 0;

  // RP ID hash (32 bytes)
  const rpIdHash = authData.slice(offset, offset + 32);
  offset += 32;

  // Flags (1 byte)
  const flagsByte = authData[offset++];
  const flags = {
    userPresent: !!(flagsByte & 0x01),
    userVerified: !!(flagsByte & 0x04),
    backupEligible: !!(flagsByte & 0x08),
    backupState: !!(flagsByte & 0x10),
    attestedCredentialData: !!(flagsByte & 0x40),
    extensionData: !!(flagsByte & 0x80),
  };

  // Sign count (4 bytes, big-endian)
  const signCount =
    (authData[offset] << 24) |
    (authData[offset + 1] << 16) |
    (authData[offset + 2] << 8) |
    authData[offset + 3];
  offset += 4;

  const result: AuthenticatorData = {
    rpIdHash,
    flags,
    signCount,
  };

  // Parse attested credential data if present and requested
  if (flags.attestedCredentialData && includeCredential) {
    if (authData.length < offset + 18) {
      throw new Error('Authenticator data too short for attested credential');
    }

    // AAGUID (16 bytes)
    result.aaguid = authData.slice(offset, offset + 16);
    offset += 16;

    // Credential ID length (2 bytes, big-endian)
    const credentialIdLength = (authData[offset] << 8) | authData[offset + 1];
    offset += 2;

    // Credential ID
    result.credentialId = authData.slice(offset, offset + credentialIdLength);
    offset += credentialIdLength;

    // Credential public key (remaining bytes, COSE format)
    result.credentialPublicKey = authData.slice(offset);
  }

  return result;
}

// ─── COSE Key Parsing ───

/**
 * Parse COSE public key and convert to CryptoKey
 * Supports: ES256 (-7, ECDSA P-256), RS256 (-257, RSASSA-PKCS1-v1_5)
 */
export async function coseToPublicKey(coseKey: Uint8Array): Promise<CryptoKey> {
  const decoded = decodeCbor(coseKey);

  // COSE key types:
  // 1 = kty (key type): 2 = EC2, 3 = RSA
  // 3 = alg (algorithm): -7 = ES256, -257 = RS256
  // -1 = crv (curve): 1 = P-256
  // -2 = x coordinate (EC) or n (RSA)
  // -3 = y coordinate (EC) or e (RSA)

  const kty = decoded['1'];
  const alg = decoded['3'];

  if (kty === 2 && alg === -7) {
    // EC2 key with ES256 (ECDSA P-256)
    const x = decoded['-2'];
    const y = decoded['-3'];

    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
      throw new Error('Invalid EC key: missing x or y coordinate');
    }

    // Build uncompressed point format: 0x04 || x || y
    const publicKeyBytes = new Uint8Array(1 + x.length + y.length);
    publicKeyBytes[0] = 0x04;
    publicKeyBytes.set(x, 1);
    publicKeyBytes.set(y, 1 + x.length);

    return crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
  } else if (kty === 3 && alg === -257) {
    // RSA key with RS256
    const n = decoded['-1'];
    const e = decoded['-2'];

    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) {
      throw new Error('Invalid RSA key: missing n or e');
    }

    // Build JWK
    const jwk: JsonWebKey = {
      kty: 'RSA',
      alg: 'RS256',
      n: bufferToBase64Url(n),
      e: bufferToBase64Url(e),
    };

    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify']
    );
  }

  throw new Error(`Unsupported COSE key type: kty=${kty}, alg=${alg}`);
}

// ─── Signature Verification ───

/**
 * Convert ASN.1 DER signature to raw R||S format
 * ECDSA signatures from WebAuthn are in DER format
 */
function derToRaw(derSignature: Uint8Array): Uint8Array {
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  if (derSignature[0] !== 0x30) {
    // Might already be raw format
    return derSignature;
  }

  let offset = 2; // Skip 0x30 and length byte

  // Handle long form length
  if (derSignature[1] & 0x80) {
    offset += (derSignature[1] & 0x7f);
  }

  // Parse R
  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: expected 0x02 for R');
  }
  let rLength = derSignature[offset++];
  let rStart = offset;
  // Skip leading zero if present (used for positive number representation)
  if (derSignature[rStart] === 0x00 && rLength > 32) {
    rStart++;
    rLength--;
  }
  const r = derSignature.slice(rStart, rStart + Math.min(rLength, 32));
  offset = rStart + rLength - (derSignature[rStart - 1] === 0x00 ? 0 : 0);
  offset = rStart - 1 + derSignature[rStart - 1] + (derSignature[rStart - 2] === 0x00 ? 1 : 0);

  // Re-parse from scratch for robustness
  offset = 2;
  if (derSignature[1] & 0x80) {
    offset += (derSignature[1] & 0x7f);
  }
  offset++; // 0x02
  const rLen = derSignature[offset++];
  const rBytes = derSignature.slice(offset, offset + rLen);
  offset += rLen;

  // Parse S
  offset++; // 0x02
  const sLen = derSignature[offset++];
  const sBytes = derSignature.slice(offset, offset + sLen);

  // Normalize to 32 bytes each (P-256)
  const rawSig = new Uint8Array(64);

  // Copy R, padding or trimming as needed
  if (rBytes.length > 32) {
    // Remove leading zeros
    rawSig.set(rBytes.slice(rBytes.length - 32), 0);
  } else {
    // Pad with leading zeros
    rawSig.set(rBytes, 32 - rBytes.length);
  }

  // Copy S, padding or trimming as needed
  if (sBytes.length > 32) {
    rawSig.set(sBytes.slice(sBytes.length - 32), 32);
  } else {
    rawSig.set(sBytes, 64 - sBytes.length);
  }

  return rawSig;
}

/**
 * Verify WebAuthn assertion signature
 * @param publicKey COSE public key bytes
 * @param signedData Data that was signed (authenticatorData || clientDataHash)
 * @param signature DER-encoded signature
 */
export async function verifySignature(
  publicKey: Uint8Array,
  signedData: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  try {
    const cryptoKey = await coseToPublicKey(publicKey);
    const algorithm = cryptoKey.algorithm;

    if (algorithm.name === 'ECDSA') {
      // Convert DER to raw signature format
      const rawSignature = derToRaw(signature);
      return crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        rawSignature,
        signedData
      );
    } else if (algorithm.name === 'RSASSA-PKCS1-v1_5') {
      return crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        signature,
        signedData
      );
    }

    return false;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// ─── Attestation Object Parsing ───

export interface AttestationObject {
  fmt: string;                    // Attestation format (e.g., "none", "packed")
  authData: Uint8Array;           // Authenticator data
  attStmt: Record<string, any>;   // Attestation statement
}

/**
 * Parse attestation object from registration response
 */
export function parseAttestationObject(buffer: Uint8Array): AttestationObject {
  const decoded = decodeCbor(buffer);

  if (typeof decoded.fmt !== 'string') {
    throw new Error('Invalid attestation: missing fmt');
  }
  if (!(decoded.authData instanceof Uint8Array)) {
    throw new Error('Invalid attestation: missing authData');
  }

  return {
    fmt: decoded.fmt,
    authData: decoded.authData,
    attStmt: decoded.attStmt || {},
  };
}

// ─── Helper Functions ───

/**
 * Constant-time array comparison
 */
export function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  // Use constant-time comparison
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Compute SHA-256 hash
 */
export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

// ─── WebAuthn Configuration Types ───

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  origin: string;
  timeout: number;
  challengeTtl: number;
}

/**
 * Get WebAuthn configuration from environment
 */
export function getWebAuthnConfig(webAppUrl: string, systemTitle?: string): WebAuthnConfig {
  const url = new URL(webAppUrl);
  return {
    rpId: url.hostname,
    rpName: systemTitle || 'Scoring System',
    origin: url.origin,
    timeout: 300000,      // 5 minutes
    challengeTtl: 300,    // 5 minutes in seconds
  };
}
