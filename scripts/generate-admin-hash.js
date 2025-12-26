#!/usr/bin/env node

/**
 * Generate password hash for Scoring System
 *
 * 哈希算法：
 * 1. 生成随机 salt (16 字符)
 * 2. 将密码和 salt 组合
 * 3. 使用 MD5 哈希多轮（默认 10 轮）
 * 4. 返回格式：salt$hash
 *
 * 注：使用 MD5 因为 Cloudflare Workers 原生支持
 *
 * 使用方法：
 *   node scripts/generate-admin-hash.js <password> [rounds]
 *   node scripts/generate-admin-hash.js mySecurePassword123
 *   node scripts/generate-admin-hash.js mySecurePassword123 10
 */

const crypto = require('crypto');

/**
 * 生成随机 salt（与 GAS 兼容）
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
 * 哈希密码（使用 MD5 + Salt）
 * Cloudflare Workers 原生支持 MD5，比 SHA-256 更简单
 */
function hashPassword(password, rounds = 10) {
  if (!password) {
    throw new Error('Password is required');
  }

  // 生成随机 salt
  const salt = generateSalt();

  // 组合密码和 salt
  const saltedPassword = password + salt;

  // 多轮 MD5 哈希
  let hashed = saltedPassword;

  for (let i = 0; i < rounds; i++) {
    hashed = crypto.createHash('md5').update(hashed).digest('hex');
  }

  // 返回 salt + hash（用 $ 分隔）
  return salt + '$' + hashed;
}

/**
 * 验证密码（测试用）
 */
function verifyPassword(password, hash, rounds = 10) {
  if (!password || !hash) {
    return false;
  }

  try {
    // 分离 salt 和 hash
    const parts = hash.split('$');
    if (parts.length !== 2) {
      return false;
    }

    const salt = parts[0];
    const storedHash = parts[1];

    // 使用相同的算法重新哈希
    const saltedPassword = password + salt;
    let hashed = saltedPassword;

    for (let i = 0; i < rounds; i++) {
      hashed = crypto.createHash('md5').update(hashed).digest('hex');
    }

    return hashed === storedHash;

  } catch (error) {
    console.error('Verification error:', error.message);
    return false;
  }
}

// ============================================
// CLI 主程序
// ============================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log('Generate Password Hash for Scoring System');
    console.log('==========================================');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/generate-admin-hash.js <password> [rounds]');
    console.log('');
    console.log('Arguments:');
    console.log('  password    Password to hash (required)');
    console.log('  rounds      Number of MD5 rounds (default: 10)');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/generate-admin-hash.js mySecurePassword');
    console.log('  node scripts/generate-admin-hash.js admin123456 10');
    console.log('');
    process.exit(0);
  }

  const password = args[0];
  const rounds = parseInt(args[1]) || 10;

  if (!password) {
    console.error('Error: Password is required');
    process.exit(1);
  }

  // 生成哈希
  const hash = hashPassword(password, rounds);

  // 验证哈希（自检）
  const isValid = verifyPassword(password, hash, rounds);

  // 输出结果
  console.log('');
  console.log('='.repeat(60));
  console.log('Password Hash Generated Successfully');
  console.log('='.repeat(60));
  console.log('');
  console.log('Password:   ', password);
  console.log('Rounds:     ', rounds);
  console.log('');
  console.log('Hash:       ', hash);
  console.log('');
  console.log('Verification:', isValid ? '✓ PASSED' : '✗ FAILED');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('⚠️  IMPORTANT:');
  console.log('   1. Copy the hash above to database/seed.sql');
  console.log('   2. Replace PLACEHOLDER_PASSWORD_HASH with this value');
  console.log('   3. Keep the password secure - do not commit it!');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
}

// 如果直接运行脚本
if (require.main === module) {
  main();
}

// 导出函数供其他脚本使用
module.exports = {
  hashPassword,
  verifyPassword,
  generateSalt
};
