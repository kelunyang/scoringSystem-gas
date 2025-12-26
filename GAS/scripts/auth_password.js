/**
 * @fileoverview Password hashing and validation for GAS environment
 * @module AuthPassword
 */

/**
 * Hash a password using GAS built-in digest functions
 * Since bcrypt is not available in GAS, we use SHA-256 with salt
 */
function hashPassword(password) {
  if (!password) {
    throw new Error('Password is required');
  }
  
  // Generate a random salt
  const salt = generateSalt();
  
  // Combine password and salt
  const saltedPassword = password + salt;
  
  // Hash using SHA-256 (multiple rounds for security)
  let hashed = saltedPassword;
  const rounds = parseInt(PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT_ROUNDS') || '10');
  
  for (let i = 0; i < rounds; i++) {
    hashed = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashed)
      .map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Return salt + hash (separated by $)
  return salt + '$' + hashed;
}

/**
 * Verify a password against a hash
 */
function verifyPassword(password, hash) {
  if (!password || !hash) {
    return false;
  }
  
  try {
    // Split salt and hash
    const parts = hash.split('$');
    if (parts.length !== 2) {
      return false;
    }
    
    const salt = parts[0];
    const storedHash = parts[1];
    
    // Combine password and salt
    const saltedPassword = password + salt;
    
    // Hash using the same process
    let hashed = saltedPassword;
    const rounds = parseInt(PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT_ROUNDS') || '10');
    
    for (let i = 0; i < rounds; i++) {
      hashed = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashed)
        .map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0'))
        .join('');
    }
    
    // Compare hashes
    return hashed === storedHash;
    
  } catch (error) {
    console.error('Password verification error:', error.message);
    return false;
  }
}

/**
 * Generate a random salt
 */
function generateSalt(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return salt;
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password) {
  const errors = [];
  
  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors: errors };
  }
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters long');
  }
  
  // Check for at least one letter
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('Password must contain at least one letter');
  }
  
  // Check for at least one number (optional, but recommended)
  if (!/\d/.test(password)) {
    // This is a warning, not an error
    console.info('Password strength: Consider including at least one number');
  }
  
  // Check for common weak passwords
  const weakPasswords = [
    'password', '123456', '123456789', 'qwerty', 'abc123',
    'password123', '123123', 'admin', 'letmein', 'welcome'
  ];
  
  if (weakPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common and easily guessable');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(length = 12) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = uppercase + lowercase + numbers + symbols;
  let password = '';
  
  // Ensure at least one character from each category
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += symbols.charAt(Math.floor(Math.random() * symbols.length));
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Hash a password for invitation tokens (lighter hashing)
 */
function hashInvitationToken(token) {
  if (!token) {
    throw new Error('Token is required');
  }
  
  // Simple SHA-256 hash for invitation tokens (no salt needed)
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
    .map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify invitation token
 */
function verifyInvitationToken(token, hash) {
  if (!token || !hash) {
    return false;
  }
  
  try {
    const computedHash = hashInvitationToken(token);
    return computedHash === hash;
  } catch (error) {
    console.error('Invitation token verification error:', error.message);
    return false;
  }
}

/**
 * Generate secure session token
 */
function generateSessionToken() {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  const combined = timestamp + random;
  
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined)
    .map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant time string comparison to prevent timing attacks
 */
function constantTimeEquals(a, b) {
  if (!a || !b) {
    return false;
  }
  
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Rate limiting removed - GAS creates new instances per request,
 * in-memory Map doesn't persist across requests.
 * Login attempts are logged to LOG_SPREADSHEET for security auditing.
 */

/**
 * Analyze suspicious login attempts from LOG_SPREADSHEET
 * Returns array of suspicious login attempts in last 24 hours
 * @returns {Array} [{username, clientId, timestamp, reason}]
 */
function analyzeSuspiciousLogins() {
  try {
    const suspiciousAttempts = [];
    const now = Date.now();
    const lookbackPeriod = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = now - lookbackPeriod;

    // Read logs from LOG_SPREADSHEET
    const logSpreadsheet = getLogSpreadsheet();
    const sheet = logSpreadsheet.getActiveSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return suspiciousAttempts;
    }

    // Read all log data (header row + data rows)
    const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const logs = range.getValues();

    // Parse logs and find authentication-related entries
    const loginAttempts = new Map(); // username -> { failed: [], clientIds: Set }

    logs.forEach(row => {
      try {
        const timestamp = new Date(row[0]).getTime();
        if (timestamp < cutoffTime) return; // Skip old logs

        const level = row[1];
        const context = row[2];
        const message = row[3];
        const detailsJson = row[4];

        // Parse details JSON
        let details = {};
        try {
          details = JSON.parse(detailsJson);
        } catch (e) {
          return;
        }

        // Check if this is an authentication log
        if (context === 'Authentication failed' || message.includes('Authentication')) {
          const username = details.username || 'unknown';
          const clientIP = details.clientIP || 'unknown';
          const action = details.action || '';

          if (!loginAttempts.has(username)) {
            loginAttempts.set(username, {
              failed: [],
              clientIPs: new Set()
            });
          }

          const userAttempts = loginAttempts.get(username);
          userAttempts.clientIPs.add(clientIP);

          if (action === 'login_failed') {
            userAttempts.failed.push({
              timestamp: timestamp,
              clientIP: clientIP,
              details: details.details
            });
          }
        }
      } catch (error) {
        // Skip malformed log entries
      }
    });

    // Analyze patterns and identify suspicious activity
    loginAttempts.forEach((attempts, username) => {
      // Pattern 1: More than 5 failed attempts in 24 hours
      if (attempts.failed.length >= 5) {
        suspiciousAttempts.push({
          username: username,
          clientIP: Array.from(attempts.clientIPs).join(', '),
          timestamp: new Date(Math.max(...attempts.failed.map(a => a.timestamp))).toISOString(),
          reason: `${attempts.failed.length} failed login attempts in 24 hours`,
          failedCount: attempts.failed.length
        });
      }

      // Pattern 2: Multiple different client IPs (potential distributed attack)
      if (attempts.clientIPs.size >= 3 && attempts.failed.length >= 3) {
        suspiciousAttempts.push({
          username: username,
          clientIP: Array.from(attempts.clientIPs).join(', '),
          timestamp: new Date(Math.max(...attempts.failed.map(a => a.timestamp))).toISOString(),
          reason: `Multiple client IPs (${attempts.clientIPs.size}) with ${attempts.failed.length} failed attempts`,
          failedCount: attempts.failed.length
        });
      }
    });

    log('Suspicious login analysis completed', {
      totalSuspicious: suspiciousAttempts.length,
      analyzedAccounts: loginAttempts.size
    });

    return suspiciousAttempts;

  } catch (error) {
    logErr('Analyze suspicious logins error', error);
    return [];
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hashPassword,
    verifyPassword,
    generateSalt,
    validatePasswordStrength,
    generateSecurePassword,
    hashInvitationToken,
    verifyInvitationToken,
    generateSessionToken,
    constantTimeEquals
  };
}