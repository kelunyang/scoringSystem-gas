/**
 * @fileoverview Passkey (WebAuthn/FIDO2) authentication handlers
 * Implements W3C Web Authentication API for biometric/hardware key 2FA
 */

import type { Env } from '../../types';
import { logGlobalOperation } from '../../utils/logging';
import {
  generateChallenge,
  bufferToBase64Url,
  base64UrlToBuffer,
  parseAttestationObject,
  parseAuthenticatorData,
  verifySignature,
  arraysEqual,
  sha256,
  getWebAuthnConfig,
  type WebAuthnConfig,
} from '../../utils/webauthn';

// ─── Types ───

export interface PasskeyCredential {
  credentialId: string;
  userId: string;
  deviceName: string;
  transports: string[];
  createdAt: number;
  lastUsedAt: number | null;
  backedUp: boolean;
}

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey: 'required' | 'preferred' | 'discouraged';
    userVerification: 'required' | 'preferred' | 'discouraged';
  };
  attestation: 'none' | 'indirect' | 'direct';
  excludeCredentials: Array<{
    id: string;
    type: 'public-key';
    transports?: string[];
  }>;
  timeout: number;
}

export interface PasskeyAuthenticationOptions {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: 'required' | 'preferred' | 'discouraged';
  allowCredentials: Array<{
    id: string;
    type: 'public-key';
    transports?: string[];
  }>;
}

export interface PasskeyRegistrationResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  deviceName?: string;
}

export interface PasskeyAuthenticationResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
}

// ─── Helper Functions ───

function getConfig(env: Env): WebAuthnConfig {
  const webAppUrl = env.WEB_APP_URL || 'https://scoring.kelunyang.online';
  return getWebAuthnConfig(webAppUrl, env.SYSTEM_TITLE);
}

// ─── Passkey Status ───

/**
 * Get passkey status for a user
 */
export async function getPasskeyStatus(
  env: Env,
  userId: string
): Promise<{
  enabled: boolean;
  credentialCount: number;
  credentials: PasskeyCredential[];
}> {
  const credentials = await env.DB
    .prepare(`
      SELECT credentialId, userId, deviceName, transports, createdAt, lastUsedAt, backedUp
      FROM passkey_credentials
      WHERE userId = ?
      ORDER BY lastUsedAt DESC NULLS LAST, createdAt DESC
    `)
    .bind(userId)
    .all();

  const parsedCredentials: PasskeyCredential[] = credentials.results.map((row: any) => ({
    credentialId: row.credentialId,
    userId: row.userId,
    deviceName: row.deviceName || 'Passkey',
    transports: JSON.parse(row.transports || '[]'),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    backedUp: row.backedUp === 1,
  }));

  return {
    enabled: parsedCredentials.length > 0,
    credentialCount: parsedCredentials.length,
    credentials: parsedCredentials,
  };
}

// ─── Registration ───

/**
 * Initialize passkey registration ceremony
 * Generates challenge and returns options for navigator.credentials.create()
 */
export async function initPasskeyRegistration(
  env: Env,
  userId: string,
  userEmail: string,
  /** 'platform' = 綁定這台電腦（Hello/Touch ID）；'cross-platform' = 綁定手機/安全金鑰（跳 QR）；不給 = 由系統選 */
  attachment?: 'platform' | 'cross-platform'
): Promise<PasskeyRegistrationOptions> {
  const config = getConfig(env);
  const challenge = generateChallenge();

  // Get existing credentials to exclude
  const existing = await env.DB
    .prepare('SELECT credentialId, transports FROM passkey_credentials WHERE userId = ?')
    .bind(userId)
    .all();

  const excludeCredentials = existing.results.map((row: any) => ({
    id: row.credentialId,
    type: 'public-key' as const,
    transports: JSON.parse(row.transports || '["internal", "hybrid"]'),
  }));

  // Store challenge in KV with 5-minute TTL
  const challengeData = {
    challenge,
    userId,
    userEmail,
    type: 'registration',
    createdAt: Date.now(),
  };
  await env.KV.put(
    `passkey_challenge:${userId}`,
    JSON.stringify(challengeData),
    { expirationTtl: config.challengeTtl }
  );

  // Build registration options
  // Use base64url-encoded userId as user.id
  const userIdBytes = new TextEncoder().encode(userId);
  const userIdBase64 = bufferToBase64Url(userIdBytes);

  return {
    challenge,
    rp: {
      id: config.rpId,
      name: config.rpName,
    },
    user: {
      id: userIdBase64,
      name: userEmail,
      displayName: userEmail.split('@')[0],
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },    // ES256 (preferred)
      { type: 'public-key', alg: -257 },  // RS256 (fallback)
    ],
    authenticatorSelection: {
      // attachment 由使用者選擇：
      //   'platform'       → 只用本機（Windows Hello / Touch ID），不跳 QR
      //   'cross-platform' → 排除本機 → 直接跳 QR / 安全金鑰（綁定手機）
      //   undefined        → 不限制，由作業系統視窗讓使用者自己挑
      ...(attachment ? { authenticatorAttachment: attachment } : {}),
      residentKey: 'preferred',             // Enable discoverable credentials
      userVerification: 'required',
    },
    attestation: 'none',  // No attestation required for consumer apps
    excludeCredentials,
    timeout: config.timeout,
  };
}

/**
 * Verify passkey registration response and store credential
 */
export async function verifyPasskeyRegistration(
  env: Env,
  userId: string,
  userEmail: string,
  credential: PasskeyRegistrationResponse
): Promise<{ success: boolean; credentialId: string; deviceName: string }> {
  const config = getConfig(env);

  // Retrieve stored challenge
  const challengeKey = `passkey_challenge:${userId}`;
  const challengeData = await env.KV.get(challengeKey);
  if (!challengeData) {
    throw new Error('Challenge expired or not found');
  }

  const stored = JSON.parse(challengeData);
  if (stored.type !== 'registration' || stored.userId !== userId) {
    throw new Error('Invalid challenge');
  }

  // Parse client data
  const clientDataJSON = new TextDecoder().decode(base64UrlToBuffer(credential.response.clientDataJSON));
  const clientData = JSON.parse(clientDataJSON);

  // Verify type
  if (clientData.type !== 'webauthn.create') {
    throw new Error('Invalid ceremony type');
  }

  // Verify origin
  if (clientData.origin !== config.origin) {
    throw new Error(`Invalid origin: expected ${config.origin}, got ${clientData.origin}`);
  }

  // Verify challenge
  if (clientData.challenge !== stored.challenge) {
    throw new Error('Challenge mismatch');
  }

  // Parse attestation object
  const attestationBuffer = base64UrlToBuffer(credential.response.attestationObject);
  const attestation = parseAttestationObject(attestationBuffer);

  // Parse authenticator data
  const authData = parseAuthenticatorData(attestation.authData, true);

  // Verify RP ID hash
  const expectedRpIdHash = await sha256(config.rpId);
  if (!arraysEqual(authData.rpIdHash, expectedRpIdHash)) {
    throw new Error('RP ID hash mismatch');
  }

  // Verify user presence
  if (!authData.flags.userPresent) {
    throw new Error('User presence not verified');
  }

  // Ensure we have credential data
  if (!authData.credentialId || !authData.credentialPublicKey) {
    throw new Error('Missing credential data');
  }

  // Store credential
  const now = Date.now();
  const credentialId = bufferToBase64Url(authData.credentialId);
  const publicKey = bufferToBase64Url(authData.credentialPublicKey);
  const deviceName = credential.deviceName || 'Passkey';
  const transports = JSON.stringify(credential.response.transports || ['internal', 'hybrid']);
  const aaguid = authData.aaguid ? bufferToBase64Url(authData.aaguid) : null;

  await env.DB
    .prepare(`
      INSERT INTO passkey_credentials
      (credentialId, userId, credentialPublicKey, counter, deviceName, transports, aaguid, backedUp, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      credentialId,
      userId,
      publicKey,
      authData.signCount,
      deviceName,
      transports,
      aaguid,
      authData.flags.backupState ? 1 : 0,
      now
    )
    .run();

  // Update user passkey status
  await env.DB
    .prepare('UPDATE users SET passkeyEnabled = 1, passkeyEnabledAt = ? WHERE userId = ?')
    .bind(now, userId)
    .run();

  // Delete used challenge
  await env.KV.delete(challengeKey);

  // Log registration
  await logGlobalOperation(
    env,
    userEmail,
    'passkey_registered',
    'user',
    userId,
    {
      credentialId: credentialId.substring(0, 20) + '...',
      deviceName,
      attestationFormat: attestation.fmt,
      backedUp: authData.flags.backupState,
    },
    { level: 'info' }
  );

  return { success: true, credentialId, deviceName };
}

// ─── Authentication ───

/**
 * Initialize passkey authentication ceremony
 * Returns null if user has no passkeys
 */
export async function initPasskeyAuthentication(
  env: Env,
  userEmail: string,
  /** true = 使用你的手機登入：送空的 allowCredentials（discoverable）→ 跳「用其他裝置」QR */
  crossDevice = false
): Promise<PasskeyAuthenticationOptions | null> {
  const config = getConfig(env);

  // Get user and check passkey status
  const user = await env.DB
    .prepare('SELECT userId, passkeyEnabled FROM users WHERE userEmail = ?')
    .bind(userEmail)
    .first<{ userId: string; passkeyEnabled: number }>();

  if (!user || user.passkeyEnabled !== 1) {
    return null;
  }

  // Get user's passkey credentials
  const credentials = await env.DB
    .prepare('SELECT credentialId, transports FROM passkey_credentials WHERE userId = ?')
    .bind(user.userId)
    .all();

  if (credentials.results.length === 0) {
    return null;
  }

  const challenge = generateChallenge();

  // Store challenge in KV
  const challengeData = {
    challenge,
    userEmail,
    userId: user.userId,
    type: 'authentication',
    createdAt: Date.now(),
  };
  await env.KV.put(
    `passkey_auth:${userEmail}`,
    JSON.stringify(challengeData),
    { expirationTtl: config.challengeTtl }
  );

  return {
    challenge,
    rpId: config.rpId,
    timeout: config.timeout,
    userVerification: 'required',
    // 「使用手機登入」送空陣列（discoverable）→ 系統顯示完整 passkey 選單含 QR；
    // 「使用這台電腦」照舊帶入該帳號已註冊的憑證 → 直接走本機。
    allowCredentials: crossDevice
      ? []
      : credentials.results.map((row: any) => ({
          id: row.credentialId,
          type: 'public-key' as const,
          transports: JSON.parse(row.transports || '["internal", "hybrid"]'),
        })),
  };
}

/**
 * Verify passkey authentication response
 */
export async function verifyPasskeyAuthentication(
  env: Env,
  userEmail: string,
  credential: PasskeyAuthenticationResponse
): Promise<{ success: boolean; userId: string }> {
  const config = getConfig(env);

  // Retrieve stored challenge
  const challengeKey = `passkey_auth:${userEmail}`;
  const challengeData = await env.KV.get(challengeKey);
  if (!challengeData) {
    throw new Error('Challenge expired or not found');
  }

  const stored = JSON.parse(challengeData);
  if (stored.type !== 'authentication' || stored.userEmail !== userEmail) {
    throw new Error('Invalid challenge');
  }

  // Find credential in database
  const storedCredential = await env.DB
    .prepare(`
      SELECT pc.*, u.userEmail, u.userId, u.status
      FROM passkey_credentials pc
      JOIN users u ON pc.userId = u.userId
      WHERE pc.credentialId = ? AND u.userEmail = ?
    `)
    .bind(credential.id, userEmail)
    .first<{
      credentialId: string;
      userId: string;
      credentialPublicKey: string;
      counter: number;
      status: string;
    }>();

  if (!storedCredential) {
    throw new Error('Credential not found');
  }

  if (storedCredential.status === 'disabled') {
    throw new Error('Account disabled');
  }

  // Parse client data
  const clientDataJSON = new TextDecoder().decode(base64UrlToBuffer(credential.response.clientDataJSON));
  const clientData = JSON.parse(clientDataJSON);

  // Verify type
  if (clientData.type !== 'webauthn.get') {
    throw new Error('Invalid ceremony type');
  }

  // Verify origin
  if (clientData.origin !== config.origin) {
    throw new Error('Invalid origin');
  }

  // Verify challenge
  if (clientData.challenge !== stored.challenge) {
    throw new Error('Challenge mismatch');
  }

  // Parse authenticator data
  const authDataBuffer = base64UrlToBuffer(credential.response.authenticatorData);
  const authData = parseAuthenticatorData(authDataBuffer, false);

  // Verify RP ID hash
  const expectedRpIdHash = await sha256(config.rpId);
  if (!arraysEqual(authData.rpIdHash, expectedRpIdHash)) {
    throw new Error('RP ID hash mismatch');
  }

  // Verify user presence
  if (!authData.flags.userPresent) {
    throw new Error('User presence not verified');
  }

  // Require user verification (biometric / PIN)
  if (!authData.flags.userVerified) {
    throw new Error('User verification required');
  }

  // Verify signature
  const publicKey = base64UrlToBuffer(storedCredential.credentialPublicKey);
  const signature = base64UrlToBuffer(credential.response.signature);
  const clientDataHash = await sha256(base64UrlToBuffer(credential.response.clientDataJSON));

  // Signed data = authenticatorData || clientDataHash
  const signedData = new Uint8Array(authDataBuffer.length + clientDataHash.length);
  signedData.set(authDataBuffer, 0);
  signedData.set(clientDataHash, authDataBuffer.length);

  const isValid = await verifySignature(publicKey, signedData, signature);
  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Verify counter (replay attack prevention)
  // Note: synced passkeys (Apple/Google) always report signCount = 0, so the
  // signCount > 0 guard ensures they are never falsely flagged.
  if (authData.signCount > 0 && authData.signCount <= storedCredential.counter) {
    // Possible cloned authenticator - log and reject
    await logGlobalOperation(
      env,
      userEmail,
      'passkey_counter_warning',
      'user',
      storedCredential.userId,
      {
        credentialId: credential.id.substring(0, 20) + '...',
        expectedCounter: storedCredential.counter,
        actualCounter: authData.signCount,
      },
      { level: 'warning' }
    );
    throw new Error('Possible cloned authenticator detected');
  }

  // Update counter and last used
  const now = Date.now();
  await env.DB
    .prepare('UPDATE passkey_credentials SET counter = ?, lastUsedAt = ? WHERE credentialId = ?')
    .bind(authData.signCount, now, credential.id)
    .run();

  // Delete used challenge
  await env.KV.delete(challengeKey);

  // Log successful authentication
  await logGlobalOperation(
    env,
    userEmail,
    'passkey_authenticated',
    'user',
    storedCredential.userId,
    { credentialId: credential.id.substring(0, 20) + '...' },
    { level: 'info' }
  );

  return { success: true, userId: storedCredential.userId };
}

// ─── Credential Management ───

/**
 * Update passkey device name
 */
export async function updatePasskeyName(
  env: Env,
  userId: string,
  credentialId: string,
  deviceName: string
): Promise<boolean> {
  const result = await env.DB
    .prepare('UPDATE passkey_credentials SET deviceName = ? WHERE credentialId = ? AND userId = ?')
    .bind(deviceName, credentialId, userId)
    .run();

  return result.meta.changes > 0;
}

/**
 * Delete a passkey credential
 */
export async function deletePasskey(
  env: Env,
  userId: string,
  userEmail: string,
  credentialId: string
): Promise<boolean> {
  const result = await env.DB
    .prepare('DELETE FROM passkey_credentials WHERE credentialId = ? AND userId = ?')
    .bind(credentialId, userId)
    .run();

  if (result.meta.changes > 0) {
    // Check if user has any remaining passkeys
    const remaining = await env.DB
      .prepare('SELECT COUNT(*) as count FROM passkey_credentials WHERE userId = ?')
      .bind(userId)
      .first<{ count: number }>();

    if (remaining && remaining.count === 0) {
      // Disable passkey for user
      await env.DB
        .prepare('UPDATE users SET passkeyEnabled = 0, passkeyEnabledAt = NULL WHERE userId = ?')
        .bind(userId)
        .run();
    }

    // Log deletion
    await logGlobalOperation(
      env,
      userEmail,
      'passkey_deleted',
      'user',
      userId,
      { credentialId: credentialId.substring(0, 20) + '...' },
      { level: 'info' }
    );

    return true;
  }

  return false;
}
