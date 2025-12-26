#!/usr/bin/env node

/**
 * @fileoverview Database reset script for Cloudflare D1
 *
 * This script provides a safe way to reset the scoring system database to initial state.
 * Features:
 * - Local database reset (delete .wrangler/state files)
 * - Remote database reset (drop all tables via SQL)
 * - Automatic backup before remote reset
 * - Support for resetting both local and remote simultaneously
 * - Safety confirmations (unless --force flag)
 *
 * Usage:
 *   pnpm db:reset:local           # Reset local development database only
 *   pnpm db:reset:remote          # Reset remote production database only
 *   pnpm db:reset:all             # Reset both local and remote
 *   pnpm db:reset:all --force     # Skip confirmations (CI/CD)
 *
 * Environment Variables:
 *   NON_INTERACTIVE=true          # Skip prompts (use with --force)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_NAME = 'scoring-system-db';
const WRANGLER_STATE_DIR = path.join(__dirname, '../.wrangler/state/v3/d1');
const BACKUP_DIR = path.join(__dirname, '../backups');

// Parse command line arguments
const args = process.argv.slice(2);
const resetLocal = args.includes('--local');
const resetRemote = args.includes('--remote');
const resetAll = args.includes('--all') || (!resetLocal && !resetRemote); // Default to all
const forceMode = args.includes('--force');
const isNonInteractive = process.env.NON_INTERACTIVE === 'true' || process.env.CI === 'true';

/**
 * Execute wrangler command and return promise
 * @param {string[]} args - Wrangler command arguments
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execWrangler(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('wrangler', args, {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(
          `wrangler command not found.
💡 Install it with: npm install -g wrangler`
        ));
      } else {
        reject(error);
      }
    });

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
        reject(new Error(
          `Wrangler command failed (exit code ${code})
Command: wrangler ${args.join(' ')}
Error: ${stderr || stdout}`
        ));
      }
    });
  });
}

/**
 * Get list of all tables in database
 * @param {string} environment - 'local' or 'remote'
 * @returns {Promise<string[]>} Array of table names
 */
async function getTableList(environment) {
  try {
    const result = await execWrangler([
      'd1', 'execute', DB_NAME,
      `--${environment}`,
      '--command=SELECT name FROM sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%"',
      '--json'
    ]);

    const data = JSON.parse(result.stdout);
    if (data.success && data.results) {
      return data.results.map(row => row.name);
    }
    return [];
  } catch (error) {
    // If database doesn't exist or no tables, return empty array
    if (error.message.toLowerCase().includes('no such table')) {
      return [];
    }
    throw error;
  }
}

/**
 * Backup remote database
 * @returns {Promise<string>} Path to backup file
 */
async function backupRemoteDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  console.log('📦 Creating backup before reset...');

  try {
    await execWrangler([
      'd1', 'export', DB_NAME,
      '--remote',
      `--output=${backupFile}`
    ]);

    console.log(`✅ Backup saved to: ${backupFile}`);
    return backupFile;
  } catch (error) {
    console.warn('⚠️  Backup failed (database might be empty):', error.message);
    return null;
  }
}

/**
 * Reset local database
 */
async function resetLocalDatabase() {
  console.log('\n🗑️  Resetting local database...');

  if (fs.existsSync(WRANGLER_STATE_DIR)) {
    console.log(`📁 Deleting: ${WRANGLER_STATE_DIR}`);
    fs.rmSync(WRANGLER_STATE_DIR, { recursive: true, force: true });
    console.log('✅ Local database files deleted');
  } else {
    console.log('ℹ️  No local database files found (already clean)');
  }

  // Reapply migrations
  console.log('\n📝 Reapplying migrations...');
  await execWrangler([
    'd1', 'migrations', 'apply', DB_NAME,
    '--local'
  ]);

  console.log('✅ Local database reset complete!');
}

/**
 * Reset remote database
 */
async function resetRemoteDatabase() {
  console.log('\n🗑️  Resetting remote database...');

  // Backup first
  await backupRemoteDatabase();

  // Get list of tables
  const tables = await getTableList('remote');

  if (tables.length === 0) {
    console.log('ℹ️  No tables found in remote database (already clean)');
  } else {
    console.log(`📋 Found ${tables.length} tables to drop:`, tables.join(', '));

    // Drop all tables in correct order (reverse dependency order)
    const dropSQL = tables
      .reverse()
      .map(table => `DROP TABLE IF EXISTS ${table};`)
      .join('\n');

    console.log('\n💣 Dropping all tables...');
    await execWrangler([
      'd1', 'execute', DB_NAME,
      '--remote',
      `--command=${dropSQL}`
    ]);

    console.log('✅ All tables dropped');
  }

  // Reapply migrations
  console.log('\n📝 Reapplying migrations...');
  await execWrangler([
    'd1', 'migrations', 'apply', DB_NAME,
    '--remote'
  ]);

  console.log('✅ Remote database reset complete!');
}

/**
 * Confirm reset action with user
 * @param {string} target - 'local', 'remote', or 'all'
 * @returns {Promise<boolean>}
 */
async function confirmReset(target) {
  if (forceMode || isNonInteractive) {
    return true;
  }

  const messages = {
    local: '⚠️  This will DELETE all local development data!',
    remote: '🚨 This will DELETE all PRODUCTION data!',
    all: '💥 This will DELETE BOTH local AND remote data!'
  };

  console.log(`\n${messages[target]}`);
  console.log('This action cannot be undone (backup will be created for remote).\n');

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: `Type the database name "${DB_NAME}" to confirm:`,
    initial: false
  });

  if (!confirm) {
    return false;
  }

  const { dbName } = await prompts({
    type: 'text',
    name: 'dbName',
    message: 'Database name:',
    validate: (value) => value === DB_NAME || `Must type exactly: ${DB_NAME}`
  });

  return dbName === DB_NAME;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🔄 Database Reset Tool\n');

    const target = resetAll ? 'all' : (resetLocal ? 'local' : 'remote');
    console.log(`📍 Target: ${target.toUpperCase()}`);

    // Confirm action
    const confirmed = await confirmReset(target);
    if (!confirmed) {
      console.log('\n❌ Reset cancelled by user');
      process.exit(0);
    }

    // Execute reset based on target
    if (resetAll || resetLocal) {
      await resetLocalDatabase();
    }

    if (resetAll || resetRemote) {
      await resetRemoteDatabase();
    }

    console.log('\n🎉 Database reset successful!');
    console.log('\n💡 Next steps:');

    if (resetAll || resetLocal) {
      console.log('   - Run: pnpm init:local (to create admin account)');
    }

    if (resetAll || resetRemote) {
      console.log('   - Run: pnpm init:remote (to create admin account)');
    }

  } catch (error) {
    console.error('\n❌ Reset failed:', error.message);
    process.exit(1);
  }
}

// Run main function
main();
