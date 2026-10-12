# 🔐 Enterprise Authentication & RBAC System

A production-grade, full-stack web application featuring:
- **Argon2id** password hashing with per-user **Salt** + env-only **Pepper**
- **TOTP-based 2FA** (Google Authenticator / Authy compatible)
- **Role-Based Access Control** — Inputer, Manager, Admin, Administrator
- **Encrypted local backups** via AES-256-CBC + `pg_dump`
- **React + Tailwind** glassmorphism UI with animated 2FA modal

---

## 📁 Project Structure

```
Computer Security/
├── backend/          # Node.js + Express API
├── frontend/         # React + Vite + Tailwind UI
└── database/
    └── schema.sql    # PostgreSQL DDL
```

---

## ⚙️ Prerequisites

| Tool         | Version  | Download |
|---|---|---|
| Node.js      | ≥ 18.0   | https://nodejs.org |
| PostgreSQL   | ≥ 14     | https://www.postgresql.org/download/ |
| npm          | ≥ 9      | Bundled with Node |

---

## 🚀 Setup Guide

### 1. Database

The application uses **local PostgreSQL as its primary database**. Set
`LOCAL_DATABASE_URL` in `backend/.env` to your local PostgreSQL connection.
Set the existing Supabase connection string as `SUPABASE_DATABASE_URL` in
`backend/.env`. The application deliberately ignores
`DATABASE_URL`, so a leftover Supabase URL cannot silently remain the
application's write target.

```powershell
# Create the database
psql -U postgres -c "CREATE DATABASE enterprise_auth;"

# Apply the schema
psql -U postgres -d enterprise_auth -f "database/schema.sql"
```

Run `schema.sql` only against a **new, empty local database**: it drops and
recreates the `users` and `audit_logs` tables. The existing Supabase data remains
unchanged, but the local database will not contain that data until the
bootstrap step below.

### 2. Backend

```powershell
cd backend

# Install dependencies
npm install

# Create your .env file
copy .env.example .env
```

**Edit `.env`** and fill in every value. Generate secrets:

```powershell
# JWT_SECRET (64 hex chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# SECRET_PEPPER (32 hex chars) ← NEVER lose this!
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# BACKUP_ENCRYPTION_KEY (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Install Google Drive for desktop, sign in to the Google account where you want
backups, and choose **Mirror files**. Create a dedicated folder inside the
mirrored Drive directory and set `GOOGLE_DRIVE_SYNC_DIR` in `backend/.env` to
that folder's absolute Windows path. No Google Cloud project, OAuth client, or
API credentials are needed.

### 3. Import existing Supabase data and enable synchronization

The local database must have the application schema and empty `users` and
`audit_logs` tables. From the `backend` folder, run this one-time bootstrap
while connected to the internet to import existing Supabase data:

```powershell
npm run sync:bootstrap
```

It refuses to overwrite local rows. Thereafter, each backend startup
automatically applies the idempotent `database/sync.sql` migration to both
databases before starting synchronization. The backend synchronizes queued
changes in both directions once a minute by default. Password/2FA setup and
login require Supabase to be reachable; already-issued access tokens can
continue to be used against the local app until they expire.

### 4. Create the first Administrator, if needed

The bootstrap copies existing accounts too. Seed an administrator only if
Supabase did not already have one:

```powershell
npm run seed
```

Follow the interactive prompts to set username, email, and password.

### 5. Start the backend

```powershell
npm run dev      # Development (with nodemon)
# or
npm start        # Production
```

Server starts at `http://localhost:5000`

### 6. Frontend

```powershell
cd ../frontend

npm install
npm run dev
```

Frontend starts at `http://localhost:5173`

---

## 🏗️ Architecture

### Authentication Flow

```
1. POST /api/auth/login            → credentials check → pending JWT (5m TTL)
2. POST /api/auth/setup-2fa        → (first login only) generate TOTP secret + QR
3. [PRIMARY]
   POST /api/auth/verify-2fa       → TOTP check (Authenticator App) → full JWT (8h TTL)
4. [BACKUP / FALLBACK]
   POST /api/auth/send-email-otp   → send 6-digit OTP to user's registered Gmail (10m TTL)
   POST /api/auth/verify-email-otp → verify email OTP → full JWT (8h TTL)
5. [PASSWORD RECOVERY]
   POST /api/auth/request-password-reset → email a 6-digit reset code (10m TTL)
   POST /api/auth/reset-password         → verify the code and save a new password
```

Password reset codes are single-use and limited to five attempts. Resetting a
password does not disable two-factor authentication; the user must still
complete their configured 2FA method at the next sign-in. Use **Forgot
password?** on the login form to begin recovery.

### Password Hashing

```
Hash = Argon2id( password : SECRET_PEPPER : salt )
         ↑ memoryCost=64MB, timeCost=3, parallelism=4
```

- `salt` → stored in DB (hex, 16 bytes, unique per user)
- `SECRET_PEPPER` → only in `.env`, never in DB
- `password_hash` → Argon2id encoded string stored in DB

### RBAC Role Matrix

| Action | Inputer | Manager | Admin | Administrator |
|---|:---:|:---:|:---:|:---:|
| Create entries | ✅ | ✅ | ✅ | ✅ |
| View entries | ✅ | ✅ | ✅ | ✅ |
| Edit entries | ✅ | ✅ | ✅ | ✅ |
| View all users | ❌ | ✅ | ✅ | ✅ |
| **Add Inputer** | ❌ | ✅ | ❌ | ✅ |
| **Delete Inputer** | ❌ | ❌ | ✅ | ✅ |
| Change roles | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ❌ | ✅ |

---

## 🔒 Encrypted Backups

```powershell
# Trigger a backup immediately
cd backend
npm run backup
```

The command creates an authenticated AES-256-GCM encrypted dump in
`backend/backups/` and copies the same encrypted file into the mirrored Google
Drive folder. Google Drive for desktop uploads it to the cloud in the
background; the application confirms the local copy, not completion of that
cloud upload. Backups older than `BACKUP_RETENTION_DAYS` are pruned from both
folders. The
file format is a 12-byte IV, encrypted SQL bytes, then a 16-byte authentication
tag. Keep `BACKUP_ENCRYPTION_KEY` separately; without it backups cannot be
restored. The cron runs daily at midnight by default.

To decrypt a current GCM backup before restoring it with `psql`, run this from
the backend folder and choose a secure output path for the plaintext SQL:

```js
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();
const file = fs.readFileSync(process.argv[2]);
const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
const iv = file.subarray(0, 12);
const tag = file.subarray(file.length - 16);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
const sql = Buffer.concat([
  decipher.update(file.subarray(12, file.length - 16)),
  decipher.final(),
]);
fs.writeFileSync(process.argv[3], sql, { mode: 0o600 });
```

For example, save the snippet as a temporary local script and run
`node decrypt.js backups/backup-<timestamp>.sql.enc restored.sql`, then restore
with `psql -U postgres -d enterprise_auth -f restored.sql`. Securely remove the
plaintext SQL after use. Backups created by the older AES-256-CBC implementation
use a different format and need its previous decryption instructions.

## 🔄 Supabase Synchronization

Changes to `users` and `audit_logs` are captured in a PostgreSQL outbox on each
database. Sync applies acknowledged changes idempotently and prevents
echo-triggered changes from being re-queued. Concurrent edits and account
uniqueness conflicts are preserved for review instead of silently overwriting
a row.

Administrators can review and resolve conflicts in the app under **Sync
Conflicts**, or via `GET /api/sync/conflicts` and
`POST /api/sync/conflicts/:id/resolve` (`resolution` is `local` or `supabase`).
The selected version is queued to propagate to both databases.

`database/sync.sql` is a non-destructive migration applied automatically at
backend startup; do not rerun `database/schema.sql` against Supabase.
`npm run sync:bootstrap` is only needed once to copy existing Supabase data to
an empty local database.
Synchronization currently covers only `users` and `audit_logs`. New tables
need matching change capture and conflict handling before they can be used
offline.

## ✉️ New-user password setup emails

When creating a user, administrators and managers can choose **Send Setup
Link**. The email includes the user's username and a single-use password setup
link that expires after 30 minutes. The user chooses their own password; no
password is sent by email. The temporary token is stored only as a SHA-256 hash
and is synchronized to Supabase before the email is delivered. After setting a
password, the user signs in and completes the existing TOTP/Email OTP setup.

Set `ACCOUNT_SETUP_URL` to the public frontend origin when local administrators
send invitations for the hosted site (for example, the Vercel frontend URL).
When omitted, the email link uses `FRONTEND_URL`. The Gmail sender's
`GMAIL_USER` and `GMAIL_APP_PASSWORD` must be configured.

## ☁️ Deploying the hosted app to Vercel

Deploy this repository as **two Vercel projects** so the Vite frontend and
Express API can use their appropriate build/runtime settings:

1. Import this Git repository into Vercel twice.
2. For the frontend project, set **Root Directory** to `frontend` and deploy
   with the Vite defaults. Add `VITE_API_URL` as
   `https://<your-backend-project>.vercel.app/api` and set
   `VITE_LOCAL_SYNC_ENABLED` to `false`.
3. For the backend project, set **Root Directory** to `backend`. Its
   `api/index.js` serverless entry serves Express through the rewrite in
   `backend/vercel.json`. The serverless instance connects to Supabase and does
   not start the local sync or backup cron jobs.
4. Add the backend environment variables in the Vercel project settings:
   `DATABASE_URL` and `SUPABASE_DATABASE_URL` (the Supabase PostgreSQL
   connection string), `JWT_SECRET`, `SECRET_PEPPER`, `JWT_EXPIRES_IN`,
   `JWT_2FA_PENDING_EXPIRES_IN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and
   `FRONTEND_URL` (the deployed frontend's HTTPS URL).
5. Keep the existing local `.env` private. Do not add local database settings,
   Google Drive paths, or database credentials to the frontend project.

Vercel cannot connect to PostgreSQL on your computer. The hosted site uses
Supabase while the local development server continues using local PostgreSQL
and synchronizing changes to Supabase. Keep the local server online to continue
local sync; Vercel does not run `pg_dump`, scheduled backups, or the local
Google Drive for desktop backup job.

---

## 🛡️ Security Features

| Feature | Implementation |
|---|---|
| Password hashing | Argon2id (64MB, 3 iterations, parallelism 4) |
| Salt | 16-byte random per user (stored in DB) |
| Pepper | 32-byte secret (env-only, never persisted) |
| 2FA | TOTP (RFC 6238), ±1 window tolerance |
| Tokens | JWT HS256 signed, 8h TTL, 5m pending 2FA |
| Rate limiting | 10 auth attempts per 15 min per IP |
| Security headers | Helmet.js |
| SQL injection | Parameterised queries (`pg` pool) |
| Backup encryption | AES-256-GCM with random per-backup IV and authentication tag |
| Backup destination | Local encrypted copy plus Google Drive for desktop mirror |
| Offline access | Existing JWT sessions work locally; login and 2FA require Supabase connectivity |
| Audit logging | All auth events + role changes written to `audit_logs` |

---

## 🔑 API Endpoints

| Method | Path | Auth | Roles |
|---|---|---|---|
| POST | `/api/auth/login` | None | — |
| POST | `/api/auth/setup-2fa` | Pending JWT | — |
| POST | `/api/auth/verify-2fa` | Pending JWT | — |
| POST | `/api/auth/send-email-otp` | Pending JWT | — |
| POST | `/api/auth/verify-email-otp` | Pending JWT | — |
| POST | `/api/auth/setup-password` | Setup token | — |
| POST | `/api/auth/logout` | JWT | Any |
| GET  | `/api/auth/me` | JWT | Any |
| GET  | `/api/users` | JWT | Manager+ |
| POST | `/api/users` | JWT | Manager, Administrator |
| POST | `/api/users/:id/send-setup-link` | JWT | Manager, Administrator |
| DELETE | `/api/users/:id` | JWT | Admin, Administrator |
| PATCH | `/api/users/:id/role` | JWT | Administrator |
| GET  | `/api/users/logs/audit` | JWT | Administrator |
| GET  | `/api/sync/conflicts` | JWT | Administrator |
| POST | `/api/sync/conflicts/:id/resolve` | JWT | Administrator |
| GET  | `/health` | None | — |
