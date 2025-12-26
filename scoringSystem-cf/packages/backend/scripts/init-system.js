#!/usr/bin/env node

/**
 * @fileoverview Interactive system initialization script for Cloudflare D1
 *
 * This script provides a secure, interactive way to initialize the scoring system database
 * Features:
 * - Interactive prompts for admin credentials (passwords hidden)
 * - Support for environment variables (for CI/CD)
 * - Password confirmation
 * - Email validation
 * - Idempotent execution (prevents duplicate initialization)
 * - Supports both local and remote D1 databases
 * - Uses PBKDF2-SHA256 for secure password hashing (same as main system)
 *
 * Usage:
 *   pnpm init:local          # Initialize local development database
 *   pnpm init:remote         # Initialize production database
 *
 * Environment Variables (optional, for CI/CD):
 *   ADMIN_EMAIL              # Admin email address
 *   ADMIN_PASSWORD           # Admin password
 *   ADMIN_NAME               # Admin display name
 *   NON_INTERACTIVE=true     # Skip prompts and use env vars
 */

import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';
import { hashPassword } from '@repo/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_NAME = 'scoring-system-db';
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';
const DEFAULT_ADMIN_NAME = 'System Administrator';

// Detect environment (--remote flag or last arg)
const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const environment = isRemote ? 'remote' : 'local';

// Check if running in CI/CD (non-interactive mode)
const isNonInteractive = process.env.NON_INTERACTIVE === 'true' || process.env.CI === 'true';

/**
 * Generate UUID with prefix (matches existing system)
 */
function generateId(prefix = 'usr') {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Validate email format
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Execute wrangler command and return promise
 * @param {string[]} args - Wrangler command arguments
 * @param {string|null} input - Optional stdin input
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {Error} If wrangler command fails or is not found
 */
function execWrangler(args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('wrangler', args, {
      stdio: input ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    // Handle case where wrangler is not installed
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(
          `wrangler command not found.
💡 Install it with: npm install -g wrangler
💡 Or run: npx wrangler ${args.join(' ')}`
        ));
      } else {
        reject(error);
      }
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Enhance error message with context
        const errorMsg = stderr || stdout;
        reject(new Error(
          `Wrangler command failed (exit code ${code})
Command: wrangler ${args.join(' ')}
Error: ${errorMsg}`
        ));
      }
    });
  });
}

/**
 * Check if system is already initialized
 * @returns {Promise<boolean>} true if users table exists and has records
 * @throws {Error} If database connection fails or other non-table errors
 */
async function checkInitialized() {
  try {
    const result = await execWrangler([
      'd1', 'execute', DB_NAME,
      `--${environment}`,
      '--command=SELECT COUNT(*) as count FROM users',
      '--json'  // Request JSON output format
    ]);

    // Parse D1 JSON output correctly
    // D1 returns format: {"success":true,"results":[{"count":0}], ...}
    try {
      const data = JSON.parse(result.stdout);

      if (data.success && data.results && data.results.length > 0) {
        const count = data.results[0].count;
        return count > 0;
      }

      return false;
    } catch (parseError) {
      // If JSON parsing fails with --json flag, this is a bug
      console.error('❌ Failed to parse D1 JSON output');
      console.error('Raw output:', result.stdout);
      throw new Error(
        `Unexpected D1 output format. This might be a wrangler version issue.
💡 Try: wrangler --version (should be >= 3.0)
💡 Or run: npm install -g wrangler@latest`
      );
    }

  } catch (error) {
    const errorMsg = error.message.toLowerCase();

    // Table doesn't exist = not initialized (expected on first run)
    // Be specific: match exact table name to avoid false positives
    if (errorMsg.includes('no such table: users') ||
        errorMsg.includes('table users not found') ||
        errorMsg.includes("no such table 'users'")) {
      return false;
    }

    // Authentication errors
    if (errorMsg.includes('not logged in') ||
        errorMsg.includes('unauthorized') ||
        errorMsg.includes('authentication required')) {
      throw new Error(
        `Not authenticated with Cloudflare.
💡 Run: wrangler login`
      );
    }

    // Database doesn't exist
    if (errorMsg.includes('database') && errorMsg.includes('not found')) {
      throw new Error(
        `Database "${DB_NAME}" not found.
💡 Check your wrangler.toml configuration`
      );
    }

    // Other errors should be re-thrown
    throw error;
  }
}

/**
 * Get admin credentials from user (interactive or env vars)
 */
async function getAdminCredentials() {
  // Non-interactive mode: use environment variables
  if (isNonInteractive) {
    const email = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || DEFAULT_ADMIN_NAME;

    if (!validateEmail(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    return { email, password, name };
  }

  // Interactive mode: prompt user
  console.log('\n🚀 Initializing Scoring System Database\n');

  // Use separate prompts for better password confirmation handling
  let email, password, name;

  // Get email
  const emailResponse = await prompts({
    type: 'text',
    name: 'value',
    message: 'Admin Email:',
    initial: DEFAULT_ADMIN_EMAIL,
    validate: (value) => validateEmail(value) || 'Invalid email format'
  });

  if (!emailResponse.value) {
    throw new Error('Initialization cancelled by user');
  }
  email = emailResponse.value;

  // Get password with confirmation loop
  let passwordConfirmed = false;
  while (!passwordConfirmed) {
    const passwordResponse = await prompts({
      type: 'password',
      name: 'value',
      message: 'Admin Password:',
      validate: (value) => value.length >= 6 || 'Password must be at least 6 characters'
    });

    if (!passwordResponse.value) {
      throw new Error('Initialization cancelled by user');
    }

    const confirmResponse = await prompts({
      type: 'password',
      name: 'value',
      message: 'Confirm Password:'
    });

    if (!confirmResponse.value) {
      throw new Error('Initialization cancelled by user');
    }

    if (passwordResponse.value === confirmResponse.value) {
      password = passwordResponse.value;
      passwordConfirmed = true;
    } else {
      console.log('❌ Passwords do not match. Please try again.\n');
    }
  }

  // Get display name
  const nameResponse = await prompts({
    type: 'text',
    name: 'value',
    message: 'Display Name:',
    initial: DEFAULT_ADMIN_NAME
  });

  if (!nameResponse.value) {
    throw new Error('Initialization cancelled by user');
  }
  name = nameResponse.value;

  return { email, password, name };
}

/**
 * Generate initialization SQL
 * @param {Object} credentials - Admin credentials
 * @param {string} passwordHash - Pre-hashed password (PBKDF2-SHA256)
 * @returns {string} SQL initialization script
 */
function generateInitSQL(credentials, passwordHash) {
  const userId = generateId('usr');
  const timestamp = Date.now();
  const globalGroupId = generateId('glb');
  const globalUserGroupId = generateId('gug');

  const globalPermissions = JSON.stringify([
    'create_project',
    'system_admin',
    'manage_users',
    'generate_invites'
  ]);

  return `
-- Check if system is already initialized
-- This SQL will only insert data if no users exist

-- Create admin user
INSERT INTO users (
  userId, password, userEmail, displayName,
  status, registrationTime, lastActivityTime, createdAt, updatedAt
)
SELECT
  '${userId}',
  '${passwordHash}',
  '${credentials.email.replace(/'/g, "''")}',  -- Escape single quotes
  '${credentials.name.replace(/'/g, "''")}',
  'active',
  ${timestamp},
  ${timestamp},
  ${timestamp},
  ${timestamp}
WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1);

-- Create Global PM group
INSERT INTO globalgroups (
  globalGroupId, groupName, description, globalPermissions,
  isActive, createdAt, updatedAt
)
SELECT
  '${globalGroupId}',
  'Global PM',
  'Global Project Managers with system administration rights',
  '${globalPermissions}',
  1,
  ${timestamp},
  ${timestamp}
WHERE NOT EXISTS (SELECT 1 FROM globalgroups WHERE groupName = 'Global PM');

-- Add admin to Global PM group
INSERT INTO globalusergroups (
  globalUserGroupId, globalGroupId, userEmail, joinedAt, isActive
)
SELECT
  '${globalUserGroupId}',
  (SELECT globalGroupId FROM globalgroups WHERE groupName = 'Global PM' LIMIT 1),
  '${credentials.email.replace(/'/g, "''")}',
  ${timestamp},
  1
WHERE NOT EXISTS (SELECT 1 FROM globalusergroups WHERE userEmail = '${credentials.email.replace(/'/g, "''")}');
`;
}

/**
 * Main initialization function
 */
async function main() {
  try {
    console.log(`\n📦 Environment: ${environment.toUpperCase()}`);

    if (isRemote) {
      console.log('⚠️  WARNING: You are initializing the PRODUCTION database!');

      if (!isNonInteractive) {
        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to continue?',
          initial: false
        });

        if (!confirm) {
          console.log('❌ Initialization cancelled');
          process.exit(0);
        }
      }
    }

    // Check if already initialized
    console.log('\n🔍 Checking if system is already initialized...');
    const isInitialized = await checkInitialized();

    if (isInitialized) {
      console.log('❌ System is already initialized!');
      console.log('   Users table already contains data.');
      process.exit(1);
    }

    console.log('✅ System is not initialized, proceeding...');

    // Get admin credentials
    const credentials = await getAdminCredentials();

    // Hash password using PBKDF2-SHA256 (same as main system)
    console.log('\n🔐 Hashing password with PBKDF2-SHA256...');
    const passwordHash = await hashPassword(credentials.password);

    // Generate SQL
    const sql = generateInitSQL(credentials, passwordHash);

    // Write to temporary file (cross-platform compatible)
    const tempFile = path.join(tmpdir(), `init-${Date.now()}.sql`);
    fs.writeFileSync(tempFile, sql);

    console.log('📝 Executing initialization SQL...');

    // Execute SQL via wrangler
    try {
      await execWrangler([
        'd1', 'execute', DB_NAME,
        `--${environment}`,
        `--file=${tempFile}`
      ]);

      // Clean up temp file
      fs.unlinkSync(tempFile);

      // Success!
      console.log('\n✅ System initialized successfully!\n');
      console.log('📧 Admin Email:', credentials.email);
      console.log('🔑 Admin Password:', '********');
      console.log('👤 Display Name:', credentials.name);
      console.log('\n⚠️  IMPORTANT: Please change the admin password after first login!\n');

      if (environment === 'local') {
        console.log('🌐 You can now start the backend with: pnpm dev:backend');
      }

    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw error;
    }

  } catch (error) {
    console.error('\n❌ Initialization failed:', error.message);

    if (error.message.includes('not logged in')) {
      console.error('\n💡 Tip: Run "wrangler login" first to authenticate with Cloudflare');
    }

    process.exit(1);
  }
}

// Run main function
main();
