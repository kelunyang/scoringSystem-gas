# Backend Scripts

This directory contains CLI scripts for managing the Cloudflare D1 database and system initialization.

## 📜 Available Scripts

### `init-system.js`

Interactive CLI script for initializing the scoring system database.

**Features:**
- ✅ Interactive password input (hidden)
- ✅ Email validation
- ✅ Password confirmation
- ✅ Prevents duplicate initialization
- ✅ Supports both local and remote D1 databases
- ✅ CI/CD compatible (non-interactive mode)

**Usage:**

```bash
# Local development database
pnpm init:local

# Production database (requires `wrangler login`)
pnpm init:remote
```

**Interactive Mode:**

The script will prompt you for:
- Admin Email (with validation)
- Admin Password (hidden, minimum 6 characters)
- Confirm Password (must match)
- Display Name

**Non-Interactive Mode (CI/CD):**

Set environment variables to skip prompts:

```bash
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="your-secure-password"
export ADMIN_NAME="System Administrator"
export NON_INTERACTIVE=true

pnpm init:local
```

**What it does:**

1. Checks if system is already initialized (prevents duplicate setup)
2. Executes schema migration (`migrations/0003_init_schema.sql`)
3. Creates admin user with hashed password
4. Creates "Global PM" group with system permissions
5. Assigns admin to Global PM group

**Output:**

```
📦 Environment: LOCAL

🔍 Checking if system is already initialized...
✅ System is not initialized, proceeding...

🚀 Initializing Scoring System Database

? Admin Email: admin@example.com
? Admin Password: ********
? Confirm Password: ********
? Display Name: System Administrator

📝 Executing initialization SQL...

✅ System initialized successfully!

📧 Admin Email: admin@example.com
🔑 Admin Password: ********
👤 Display Name: System Administrator

⚠️  IMPORTANT: Please change the admin password after first login!
```

## 🔒 Security Considerations

### Why Not HTTP API?

The previous HTTP API endpoint (`POST /auth/init-system`) has been removed for security reasons:

- ❌ **Publicly accessible** - anyone could call it
- ❌ **No authentication required**
- ❌ **Credentials in HTTP requests** (logged, cached)
- ❌ **Difficult to secure in production**

### Why CLI Script?

- ✅ **No public endpoint** - completely offline
- ✅ **Requires Cloudflare authentication** - needs `wrangler login` or API token
- ✅ **Interactive password input** - never logged or displayed
- ✅ **SQL injection safe** - uses parameterized queries
- ✅ **Idempotent** - safe to run multiple times

## 🚀 Deployment Workflow

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Apply migrations (create schema)
pnpm --filter @repo/backend db:migrate

# 3. Initialize system (create admin)
pnpm --filter @repo/backend init:local

# 4. Start backend
pnpm dev:backend
```

### Production Deployment

```bash
# 1. Authenticate with Cloudflare
wrangler login

# 2. Deploy backend
pnpm deploy:backend

# 3. Apply migrations to production
pnpm --filter @repo/backend db:migrate:remote

# 4. Initialize production database
pnpm --filter @repo/backend init:remote
```

### CI/CD (GitHub Actions Example)

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Apply D1 Migrations
        run: pnpm --filter @repo/backend db:migrate:remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Initialize Database (First Deployment Only)
        run: pnpm --filter @repo/backend init:remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
          ADMIN_NAME: "System Administrator"
          NON_INTERACTIVE: "true"

      - name: Deploy Backend
        run: pnpm deploy:backend
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## 🛠️ Troubleshooting

### "System is already initialized"

This means the database already has users. If you need to re-initialize:

1. **Development (safe)**: Delete local database and re-run
   ```bash
   rm -rf .wrangler/state/v3/d1
   pnpm init:local
   ```

2. **Production (DANGEROUS)**: Manual database reset required
   ```bash
   # Export backup first!
   wrangler d1 export scoring-system-db --remote --output=backup.sql

   # Drop all tables manually or create new database
   ```

### "Wrangler not logged in"

For remote operations, authenticate first:

```bash
wrangler login
```

Or set API tokens:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

### "Invalid email format"

Email must match pattern: `xxx@xxx.xxx`

### "Password must be at least 6 characters"

Minimum password length is 6 characters for security.

### "Passwords do not match"

Make sure password and confirmation are identical.

## 📚 Related Files

- `migrations/0003_init_schema.sql` - Complete database schema
- `../src/handlers/auth/password.ts` - Password hashing (MD5)
- `../src/utils/id-generator.ts` - UUID generation
- `../../QUICK_START.md` - Quick start guide

## 🔄 Migration from Old HTTP API

If you're migrating from the old `POST /auth/init-system` endpoint:

**Before:**
```bash
curl -X POST http://localhost:8787/auth/init-system \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123456"}'
```

**After:**
```bash
pnpm --filter @repo/backend init:local
# Then enter credentials interactively
```

Or for automation:
```bash
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="admin123456" NON_INTERACTIVE=true pnpm --filter @repo/backend init:local
```

## ❓ Questions?

See the main documentation:
- [QUICK_START.md](../../QUICK_START.md)
- [README.md](../../README.md)
