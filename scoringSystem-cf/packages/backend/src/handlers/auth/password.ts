/**
 * @fileoverview Password utilities re-exported from shared package
 *
 * This file maintains backward compatibility by re-exporting
 * password utilities from @repo/shared.
 *
 * All password hashing logic has been moved to the shared package
 * so it can be used by:
 * - Backend handlers (login, register, password reset)
 * - CLI scripts (init-system.js)
 * - Frontend (password strength validation)
 */

export {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateRandomPassword,
  needsPasswordUpgrade
} from '@repo/shared/utils/password';
