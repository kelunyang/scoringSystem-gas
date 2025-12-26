# Quick Start Guide - Cloudflare Workers Scoring System

Complete guide to get the migrated scoring system running locally and deploying to production.

## 🎯 Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Cloudflare account (free tier works!)
- Git (for deployment)

## ⚡ Quick Setup (TL;DR)

For experienced developers, here's the complete setup in one go:

```bash
# 1. Setup backend
cd Cloudflare-Workers
npm install
npx wrangler login
npx wrangler d1 create scoring-system-db
# ↑ Copy database_id and paste into wrangler.toml

# 2. Set JWT secret
npm run secret:generate
npx wrangler secret put JWT_SECRET
# ↑ Paste the generated secret

# 3. Start backend
npm run dev
# ↑ Backend runs on localhost:8787

# 4. Initialize system (in another terminal)
curl -X POST http://localhost:8787/auth/init-system \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123456","email":"admin@example.com","displayName":"Admin"}'

# 5. Setup frontend (in another terminal)
cd frontend-vue
npm install
npm run dev
# ↑ Frontend runs on localhost:5173

# 6. Open browser and login
# http://localhost:5173
# Username: admin, Password: admin123456
```

**Done!** Now read the detailed steps below for explanations.

## 📦 Project Structure

```
Cloudflare-Workers/
├── src/                      # Backend source code
│   ├── router/              # API routers (15 modules)
│   ├── handlers/            # Business logic
│   ├── middleware/          # Auth & permissions
│   ├── db/                  # Database operations
│   └── utils/               # Utilities
├── frontend-vue/            # Frontend Vue 3 SPA
│   ├── src/
│   │   ├── components/     # Vue components
│   │   └── utils/          # API client, IP detection
│   ├── package.json
│   └── vite.config.js
├── database/                # SQL schema and migrations
├── scripts/                 # Setup scripts
├── package.json             # Backend dependencies
├── wrangler.toml           # Cloudflare configuration
└── README.md
```

## 🚀 Part 1: Backend Setup

### 1. Install Backend Dependencies

```bash
cd Cloudflare-Workers
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 3. Create D1 Database

```bash
npx wrangler d1 create scoring-system-db
```

**Important**: Copy the `database_id` from the output!

Example output:
```
✅ Successfully created DB 'scoring-system-db'
database_id = "abc123-def456-ghi789"
```

### 4. Update wrangler.toml

Edit `wrangler.toml` and paste your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "scoring-system-db"
database_id = "abc123-def456-ghi789"  # ← Paste your ID here
```

### 5. Initialize Database Schema

```bash
# Create database tables
npx wrangler d1 execute scoring-system-db --local --file=./database/schema.sql

# For remote database (production)
npx wrangler d1 execute scoring-system-db --remote --file=./database/schema.sql
```

**Note**: If `database/schema.sql` doesn't exist yet, the system will auto-create tables on first API call.

### 6. Generate and Set JWT Secret (CRITICAL!)

```bash
# Generate a secure JWT secret
npm run secret:generate

# This will output something like:
# Generated JWT Secret: kxM9pL2qR5tY8wZ3nB6vC1dF4gH7jK0m...

# Copy the generated secret and set it:
npx wrangler secret put JWT_SECRET
# Paste the secret when prompted
```

**Important**:
- Use a **different** secret for production!
- Never commit secrets to git
- The secret must be at least 32 characters

### 7. (Optional) Set Additional Secrets

```bash
# For email notifications (optional)
npx wrangler secret put GMAIL_API_KEY
npx wrangler secret put GMAIL_FROM_EMAIL

# For Cloudflare Turnstile CAPTCHA (optional)
npx wrangler secret put TURNSTILE_SECRET_KEY
```

### 8. Start Backend Development Server

```bash
npm run dev
```

Backend runs on: **http://localhost:8787**

### 9. Initialize System & Create Admin Account

**⚠️ IMPORTANT: Security Improvements**

The system now uses a **secure CLI script** instead of an HTTP API endpoint for initialization. This provides:
- ✅ No public HTTP endpoint (eliminates security risk)
- ✅ Interactive password input (passwords never logged)
- ✅ PBKDF2-SHA256 password hashing (600,000 iterations, OWASP 2023 standard)
- ✅ Cross-platform support (Windows/Mac/Linux)
- ✅ Cloudflare authentication required for production

**Step 1: Apply Database Schema**

First, create the database schema (38 tables + indexes):

```bash
# Local development database
cd scoringSystem-cf
pnpm --filter @repo/backend db:migrate
```

**Step 2: Run Interactive Initialization**

Then, create the admin account:

```bash
pnpm --filter @repo/backend init:local
```

**Interactive Session Example:**
```
$ pnpm --filter @repo/backend init:local

📦 Environment: LOCAL

🔍 Checking if system is already initialized...
✅ System is not initialized, proceeding...

🚀 Initializing Scoring System Database

? Admin Email: admin@example.com
? Admin Password: ********
? Confirm Password: ********
? Display Name: System Administrator

🔐 Hashing password with PBKDF2-SHA256...
📝 Executing initialization SQL...

✅ System initialized successfully!

📧 Admin Email: admin@example.com
🔑 Admin Password: ********
👤 Display Name: System Administrator

⚠️  IMPORTANT: Please change the admin password after first login!

🌐 You can now start the backend with: pnpm dev:backend
```

**For CI/CD (Non-Interactive Mode):**

Skip prompts using environment variables:

```bash
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="your-secure-password"
export ADMIN_NAME="System Administrator"
export NON_INTERACTIVE=true

pnpm --filter @repo/backend init:local
```

**Production Database Initialization:**

```bash
# 1. Authenticate with Cloudflare (one-time)
npx wrangler login

# 2. Apply schema to production
pnpm --filter @repo/backend db:migrate:remote

# 3. Initialize production database
pnpm --filter @repo/backend init:remote
```

**⚠️  Security Notes:**
- ❌ Old HTTP endpoint (`/auth/init-system`) **has been removed**
- ✅ Passwords use PBKDF2-SHA256 (same as login system)
- ✅ Script validates email format and password confirmation
- ✅ Prevents duplicate initialization (idempotent)
- ✅ Requires Cloudflare authentication for remote databases
- ✅ Works cross-platform (Windows/Mac/Linux via `os.tmpdir()`)

**Troubleshooting:**

| Error | Solution |
|-------|----------|
| `wrangler command not found` | Run `npm install -g wrangler` |
| `Not authenticated with Cloudflare` | Run `wrangler login` |
| `Database not found` | Check `database_id` in `wrangler.toml` |
| `System is already initialized` | Database already has users (use `pnpm db:reset:local` to reset) |
| `Unexpected D1 output format` | Update wrangler: `npm install -g wrangler@latest` |

### 10. (Optional) Reset Database

If you need to reset the database to initial state (useful for testing):

**Reset Local Database Only:**
```bash
pnpm --filter @repo/backend db:reset:local
```

**Reset Remote Database Only:**
```bash
pnpm --filter @repo/backend db:reset:remote
```

**Reset Both Local and Remote:**
```bash
pnpm --filter @repo/backend db:reset:all
```

**Quick Reset + Reinitialize (Testing):**
```bash
# Reset local database and create new admin
pnpm --filter @repo/backend db:reset:local
NON_INTERACTIVE=true pnpm --filter @repo/backend init:local
```

**Safety Features:**
- ✅ Local reset: Deletes `.wrangler/state/v3/d1` directory
- ✅ Remote reset: Automatically creates backup in `backups/` directory
- ✅ Confirmation required (unless `--force` flag)
- ✅ After reset, migrations are automatically reapplied

**For CI/CD (Skip Confirmations):**
```bash
pnpm --filter @repo/backend db:nuke  # Reset both without prompts
```

### 11. Test Backend

```bash
# Test health endpoint
curl http://localhost:8787/health

# Expected response:
# {"status":"healthy","database":"connected","timestamp":...}

# Test login
curl -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123456"
  }'

# Expected: {"success":true,"token":"eyJ...","user":{...}}
```

## 🎨 Part 2: Frontend Setup

### 1. Install Frontend Dependencies

**Open a new terminal** (keep backend running), then:

```bash
cd Cloudflare-Workers/frontend-vue
npm install
```

### 2. Configure Environment (Already Done!)

The `.env.development` file is pre-configured:
```env
VITE_API_URL=http://localhost:8787
NODE_ENV=development
```

No changes needed for local development!

### 3. Start Frontend Development Server

```bash
npm run dev
```

Frontend runs on: **http://localhost:5173**

You should see:
```
  VITE v5.0.10  ready in 450 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h to show help
```

### 4. Open in Browser & Login

1. **Open**: http://localhost:5173
2. **Login with**:
   - Username: `admin`
   - Password: `admin123456`
3. **Success**: You should see the dashboard!

### 5. Verify Everything Works

Once logged in, check:
- ✅ Dashboard loads
- ✅ No console errors (press F12)
- ✅ User menu shows your name
- ✅ Navigation works

## 📊 Development Workflow

### Concurrent Development (Recommended)

**Terminal 1 - Backend:**
```bash
cd Cloudflare-Workers
npm run dev  # Port 8787
```

**Terminal 2 - Frontend:**
```bash
cd Cloudflare-Workers/frontend-vue
npm run dev  # Port 5173
```

### Hot Reload

Both servers support hot reload:
- Backend: Auto-restarts on file changes
- Frontend: Instant HMR (no page refresh needed)

## 🌐 Part 3: Production Deployment

### Backend Deployment (Cloudflare Workers)

#### 1. Update Production Environment

Edit `wrangler.toml` if needed (most settings are already configured).

#### 2. Set Production Secrets

```bash
# Make sure secrets are set (same as development)
npx wrangler secret put JWT_SECRET
# Enter your production JWT secret (should be different from dev!)
```

#### 3. Deploy Backend

```bash
npm run deploy
```

You'll get a URL like: `https://scoring-system-workers.your-account.workers.dev`

**Save this URL** - you'll need it for frontend configuration.

#### 4. Test Backend

```bash
curl https://your-worker.workers.dev
# Should return API info
```

### Frontend Deployment (Cloudflare Pages)

#### Option A: Automatic Deployment (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Frontend migration complete"
   git push
   ```

2. **Connect to Cloudflare Pages**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages
   - Click "Create a project"
   - Select "Connect to Git"
   - Choose your repository
   - Configure build:
     - **Build command**: `npm run build`
     - **Build output directory**: `dist`
     - **Root directory**: `Cloudflare-Workers/frontend-vue`
   - Add environment variable:
     - `VITE_API_URL` = `https://your-worker.workers.dev` (your backend URL)

3. **Deploy**:
   - Click "Save and Deploy"
   - Wait for build to complete (~2 minutes)
   - You'll get a URL like: `https://scoring-system.pages.dev`

#### Option B: Manual Deployment

1. **Update Production API URL**:

   Edit `frontend-vue/.env.production`:
   ```env
   VITE_API_URL=https://your-worker.workers.dev
   ```

2. **Build and Deploy**:
   ```bash
   cd frontend-vue
   npm run build
   npx wrangler pages deploy dist --project-name=scoring-system
   ```

## ✅ Post-Deployment Checklist

### Backend Verification

- [ ] Health check: `curl https://your-worker.workers.dev/health`
- [ ] API info: `curl https://your-worker.workers.dev/api`
- [ ] IP detection: `curl https://your-worker.workers.dev/api/ip`
- [ ] Login test (use Postman/curl)

### Frontend Verification

- [ ] Open production URL
- [ ] Check no console errors
- [ ] Test login/logout
- [ ] Create test project
- [ ] Submit test report
- [ ] Verify all pages load

### Performance Checks

- [ ] API response time < 100ms
- [ ] Page load time < 2s
- [ ] No CORS errors
- [ ] Session persists across page reloads

## 🔧 Troubleshooting

### "Cannot connect to backend"

**Symptoms**: Frontend shows "网路连线错误"

**Solutions**:
1. Check backend is running: `curl http://localhost:8787`
2. Check `VITE_API_URL` in `.env.development`
3. Check browser console for CORS errors
4. Verify proxy in `vite.config.js`

### "Session expired immediately"

**Symptoms**: Login works but immediately expires

**Solutions**:
1. Check JWT_SECRET is set: `npx wrangler secret list`
2. Check browser localStorage has `sessionId`
3. Check backend logs for JWT errors
4. Try clearing localStorage and logging in again

### "Database not found"

**Symptoms**: Backend returns "database not found"

**Solutions**:
1. Check `database_id` in `wrangler.toml`
2. Run `npm run db:init` if database is empty
3. Check database exists: `npx wrangler d1 list`

### "IP detection returns 'unknown'"

**Symptoms**: IP info not available

**Solutions**:
1. Check `/api/ip` endpoint: `curl http://localhost:8787/api/ip`
2. In local development, Cloudflare data may be limited
3. Test in production where Cloudflare provides full data

### Build errors

**Frontend build fails**:
```bash
cd frontend-vue
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Backend type errors**:
```bash
npm run type-check
# Fix any reported type errors
```

## 📚 Additional Resources

- [Backend README](README.md) - Complete backend documentation
- [Frontend README](frontend-vue/README.md) - Frontend documentation
- [Migration Guide](FRONTEND_MIGRATION.md) - Migration details
- [Security Guide](SECURITY.md) - Security best practices
- [NPM Commands](NPM_COMMANDS.md) - All available commands

## 🎓 Learning Path

If you're new to Cloudflare Workers:

1. **Start Here**: [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
2. **Hono Framework**: [Hono Documentation](https://hono.dev/)
3. **D1 Database**: [D1 Documentation](https://developers.cloudflare.com/d1/)
4. **Pages Deployment**: [Pages Documentation](https://developers.cloudflare.com/pages/)

## 💡 Tips & Best Practices

### Development

- Use `npm run dev` for hot reload
- Check backend logs for detailed errors
- Use browser DevTools Network tab to debug API calls
- Keep backend and frontend terminals visible

### Database

- Regular backups: `npm run db:backup`
- Test migrations locally first
- Use transactions for multi-step operations

### Security

- Never commit `.env` files
- Use different JWT_SECRET for dev/prod
- Rotate secrets regularly
- Monitor failed login attempts

### Performance

- Backend responds in 10-50ms
- Frontend loads in < 2s
- Use caching where appropriate
- Monitor Cloudflare Analytics

## 🆘 Getting Help

1. Check backend logs: `npx wrangler tail`
2. Check browser console (F12)
3. Review [PROGRESS.md](PROGRESS.md) for known issues
4. Check [Migration Guide](../plan/cloudflare/Cloudflare迁移指南.md)

## 🎉 Success!

If you've completed all steps:
- ✅ Backend running on Cloudflare Workers
- ✅ Frontend deployed to Cloudflare Pages
- ✅ Database initialized with admin account
- ✅ All API endpoints working
- ✅ Authentication via JWT
- ✅ Global edge network distribution

**You're ready to use the Cloudflare-powered scoring system!**

---

**Last Updated**: 2025-10-27
**Migration Status**: ✅ Complete
