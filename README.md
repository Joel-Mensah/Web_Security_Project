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

```powershell
# Create the database
psql -U postgres -c "CREATE DATABASE enterprise_auth;"

# Apply the schema
psql -U postgres -d enterprise_auth -f "database/schema.sql"
```

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
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Create the first Administrator

```powershell
npm run seed
```

Follow the interactive prompts to set username, email, and password.

### 4. Start the backend

```powershell
npm run dev      # Development (with nodemon)
# or
npm start        # Production
```

Server starts at `http://localhost:5000`

### 5. Frontend

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
```

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

Encrypted backups appear in `backend/backups/backup-<timestamp>.sql.enc`

**To decrypt manually:**

```js
const crypto = require('crypto');
const fs = require('fs');
const encKey = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
const fileBuffer = fs.readFileSync('backup-<ts>.sql.enc');
const iv = fileBuffer.slice(0, 16);
const encrypted = fileBuffer.slice(16);
const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
fs.writeFileSync('restored.sql', decrypted);
```

The cron automatically runs daily at midnight and prunes backups older than 30 days.

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
| Backup encryption | AES-256-CBC with random per-backup IV |
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
| POST | `/api/auth/logout` | JWT | Any |
| GET  | `/api/auth/me` | JWT | Any |
| GET  | `/api/users` | JWT | Manager+ |
| POST | `/api/users` | JWT | Manager, Administrator |
| DELETE | `/api/users/:id` | JWT | Admin, Administrator |
| PATCH | `/api/users/:id/role` | JWT | Administrator |
| GET  | `/api/users/logs/audit` | JWT | Administrator |
| GET  | `/health` | None | — |
