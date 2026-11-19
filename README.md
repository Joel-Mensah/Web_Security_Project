# 🔐 Enterprise Authentication & RBAC System

A production-grade, full-stack web application featuring:
- **Argon2id** password hashing with per-user **Salt** + env-only **Pepper**
- **TOTP-based 2FA** (Google Authenticator / Authy compatible)
- **Role-Based Access Control** — Inputer, Manager, Admin, Administrator
- **Security incident reporting** — triage queue, severity, assignments, private notes, and response timeline
- **Encrypted database backups** in private Supabase Storage
- **AWS application restore points** for Elastic Beanstalk and CloudFront releases, without changing database records
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
| npm          | ≥ 9      | Bundled with Node |

---

## 🚀 Setup Guide

### 1. Hosted Supabase database

The application uses one hosted Supabase PostgreSQL database in development
and production. Set its connection string as `SUPABASE_DATABASE_URL` in
`backend/.env`. The backend rejects localhost database URLs.

For a new, empty Supabase project, run `database/schema.sql` in the Supabase
SQL Editor. That schema drops and recreates application tables, so never run
it against a database that contains data. For an existing project, apply the
additive `database/cloud-only.sql` migration instead.

### 2. Backend

```powershell
cd backend

# Install dependencies
npm install

# Create your .env file
copy .env.example .env
```

To add demo accounts with the Inputer, Manager, Admin, and Administrator
roles, set `ALLOW_DEMO_SEED=true` for the command and run `npm run seed:demo`.
Add `-- --skip=administrator` to omit a role.
The script shows the connected database host and asks you to type
`ADD DEMO USERS` before it writes anything. Enter an email address you can
access for each account. It creates random undisclosed passwords and marks
each created account as requiring password setup. Send each user a setup email
from User Management while signed in as an Administrator. Do not seed a
production database.

In PowerShell, run:

```powershell
$env:ALLOW_DEMO_SEED = "true"
npm run seed:demo
Remove-Item Env:ALLOW_DEMO_SEED
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

Create a private Supabase Storage bucket named `enterprise-auth-backups` (or
set `SUPABASE_BACKUP_BUCKET` to another bucket name). Keep the service-role key
and `BACKUP_ENCRYPTION_KEY` on the backend only. Never add them to the
frontend environment.

### 3. Create the first Administrator, if needed

Seed an administrator only if Supabase does not already have one:

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

## 🚨 Security Incident Reporting

Open **Incident reports** after signing in to submit concerns such as suspicious
messages, possible account compromise, lost devices, malware, or potential data
exposure. Reports include a title, description, category, and initial severity.
The reporter can see their own reports and reports assigned to them.

After submission, the reporter sees a confirmation and can edit the report until
a responder posts a public reply or an Admin or Administrator records a referral for
investigation. Private responder notes do not lock the reporter out. The
referral control records the decision in the report timeline and locks further
edits. It does not send the report to an external authority, so responders
must use their approved contact process separately.

Managers, Admins, and Administrators can review the full queue, assign an active
user, adjust severity and status, add private responder notes, and post updates
visible to the reporter. Marking a report **Resolved** requires a resolution
summary. All reports include a chronological activity timeline; incident
changes are also recorded in the security audit log.

The incident API is available under `/api/incidents`:

- `GET /` and `GET /summary` — visibility-scoped inbox and counts
- `POST /` — submit a report
- `GET /:id` — view a report and its permitted activity
- `PATCH /:id` — edit your report before a public response or referral
- `PATCH /:id/triage` — manager-only status, severity, assignment, and resolution
- `POST /:id/updates` — add a public comment or manager-only private note
- `GET /assignees` — list active assignment options for responders

Reports accept up to three PNG, JPEG, or WebP screenshots, up to 5 MB each.
Redact passwords, verification codes, and unnecessary personal data before
uploading screenshots. Do not put credentials or unnecessary personal data in
report descriptions or comments. This feature coordinates reporting and
response; it does not detect, contain, or guarantee protection from threats.

---

## 🔒 Encrypted Backups

```powershell
# Trigger a backup immediately
cd backend
npm run backup
```

The command creates an AES-256-GCM encrypted snapshot and uploads it to the
configured private Supabase Storage bucket. The administrator dashboard also
has a button to start a backup and view backup history. The backup includes
account, password-reset, audit, and incident records. It does not expose
password hashes, salts, or other credential data in the dashboard.

Application restore points are separate from database backups. The dashboard
can roll back the production frontend and API to deployments made from the
same Git commit. This changes deployed application code only. It does not
restore or alter database records.

Backups require `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_BACKUP_BUCKET`, and a 64-character hex `BACKUP_ENCRYPTION_KEY`.
Set `SUPABASE_URL` to the Supabase project base URL from Project Settings >
API (for example, `https://<project-ref>.supabase.co`), not the Vercel app URL
or a REST endpoint. Create the bucket as private before using the feature. If
Storage returns an HTML/JSON parsing error, check this URL in the backend's
Vercel environment variables and redeploy.

Incident reports accept up to three PNG, JPEG, or WebP screenshots, up to
5 MB each. Use a private S3 evidence bucket with public access blocked and
server-side encryption enabled. The Elastic Beanstalk instance role can
upload, view, and remove objects under the incident evidence prefix. The API
checks that S3 blocks public access before it uploads or signs a viewing link.
Links expire after 60 seconds. Ask users to redact credentials and personal
information from screenshots before upload.

## ✉️ New-user password setup emails

When creating a user, administrators and managers can choose **Send Setup
Link**. The email includes the user's username and a single-use password setup
link that expires after 30 minutes. The user chooses their own password; no
password is sent by email. The temporary token is stored only as a SHA-256 hash
and is saved in the hosted database before the email is delivered. After setting a
password, the user signs in and completes the existing TOTP/Email OTP setup.

Set `ACCOUNT_SETUP_URL` to the public frontend origin when local administrators
send invitations for the hosted site (for example, the AWS CloudFront URL).
When omitted, the email link uses `FRONTEND_URL`. The Gmail sender's
`GMAIL_USER` and `GMAIL_APP_PASSWORD` must be configured.

## ☁️ Deploying and restoring on AWS

The AWS setup keeps PostgreSQL on Supabase. Elastic Beanstalk runs the Express
API, and a private S3 bucket plus CloudFront serves the React app and stores
release files. CloudFront sends `/api/*` requests to the API. Application
rollback switches the API version and the frontend release path. It does not
restore or change Supabase records.

The AWS deployment workflow runs when a commit reaches `main`. It builds both
apps, uploads a release to S3, updates the Elastic Beanstalk environment,
switches the CloudFront frontend origin path, and records a restore manifest.
The workflow uses GitHub's OpenID Connect role. It does not use saved AWS
access keys.

Set up AWS once before enabling the workflow. This project can incur charges
for Elastic Beanstalk, S3, and CloudFront. A Budget alert is optional and does
not stop resources or cap spending. If you do not create a budget, monitor
charges in the AWS Billing console.

1. Protect the AWS root account with MFA. Create an IAM Identity Center user
   and sign in with that user for setup. Do not create root access keys or put
   AWS credentials in chat, Git, or the frontend.
2. Install AWS CLI v2 on your Windows computer. In PowerShell, configure an
   IAM Identity Center profile and verify the account:

   ```powershell
   aws configure sso --profile project-deploy
   aws sso login --profile project-deploy
   $env:AWS_PROFILE = "project-deploy"
   $env:AWS_REGION = "us-east-1"
   aws sts get-caller-identity
   ```

   Check that the account ID is yours and the region is `us-east-1`.
3. Check Elastic Beanstalk for an existing application and environment before
   creating anything. Reuse the existing `enterprise-auth` application and
   `enterprise-auth-prod` environment in `us-east-1` if they are present.
   Record the environment CNAME and platform. Deploy the real API version
   before treating the environment as ready for users.
4. AWS must verify the account before CloudFront can create new distributions.
   In this account, CloudFront creation returned an account-verification error,
   and support case `179224908700230` is pending AWS action. Do not retry this
   stack until AWS clears the restriction. After verification, deploy the web
   hosting stack. Replace the example API origin with the Beanstalk CNAME,
   without `https://`:

   ```powershell
   $ApiOrigin = "your-environment.us-east-1.elasticbeanstalk.com"
   $EvidenceBucket = "joel-web-security-incident-evidence-592229131693"
   aws cloudformation deploy `
     --template-file infra/aws/hosting.yaml `
     --stack-name enterprise-auth-hosting `
     --parameter-overrides ApiOriginDomain=$ApiOrigin IncidentEvidenceBucketName=$EvidenceBucket `
     --region us-east-1
   ```

   Save the stack outputs `FrontendBucketName`,
   `IncidentEvidenceBucketName`, `CloudFrontDistributionId`, and `FrontendUrl`.
   The evidence bucket output should match `$EvidenceBucket`.
   Give the Elastic Beanstalk service role `s3:GetObject` access to
   `arn:aws:s3:::<FrontendBucketName>/releases/*`. Beanstalk needs to read the
   API bundles that GitHub uploads.
5. Create the API's EC2 instance role from
   `infra/aws/backend-restore-role.yaml`:

   ```powershell
   aws cloudformation deploy `
     --template-file infra/aws/backend-restore-role.yaml `
     --stack-name enterprise-auth-runtime `
     --capabilities CAPABILITY_IAM `
     --parameter-overrides ReleaseBucketName=<FrontendBucketName> IncidentEvidenceBucketName=<IncidentEvidenceBucketName> CloudFrontDistributionId=<CloudFrontDistributionId> ElasticBeanstalkApplicationName=enterprise-auth ElasticBeanstalkEnvironmentName=enterprise-auth-prod `
     --region us-east-1
   ```

   Replace the angle-bracketed values with the stack outputs. In Elastic
   Beanstalk, set the EC2 instance profile to the new stack's
   `InstanceProfileName` output. This role lets the API read release manifests
   and request AWS rollbacks.
6. Add the backend environment settings in Elastic Beanstalk. Use the required
   values from `backend/.env.example`, including `SUPABASE_DATABASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BACKUP_BUCKET`,
   `AWS_INCIDENT_EVIDENCE_BUCKET` to `$EvidenceBucket`,
   `BACKUP_ENCRYPTION_KEY`, `JWT_SECRET`, `SECRET_PEPPER`, `GMAIL_USER`,
   `GMAIL_APP_PASSWORD`, `NODE_ENV=production`, and `FRONTEND_URL`. Also set
   `AWS_REGION`, `AWS_RELEASES_BUCKET` to the frontend bucket name,
   `AWS_EB_APPLICATION_NAME`, `AWS_EB_ENVIRONMENT_NAME`, and
   `AWS_FRONTEND_DISTRIBUTION_ID`. Keep all secrets in AWS environment
   configuration, not in Git.
7. In IAM, create an OpenID Connect provider if your AWS account does not have
   one. Use `https://token.actions.githubusercontent.com` as its URL and
   `sts.amazonaws.com` as its audience. Deploy
   `infra/aws/github-deploy-role.yaml` with the repository, branch, bucket,
   CloudFront distribution ID, and Beanstalk names:

   ```powershell
   aws cloudformation deploy `
     --template-file infra/aws/github-deploy-role.yaml `
     --stack-name enterprise-auth-github-deploy `
     --capabilities CAPABILITY_IAM `
     --parameter-overrides GitHubRepository=Joel-Mensah/Web_Security_Project GitHubBranch=main ReleaseBucketName=<FrontendBucketName> CloudFrontDistributionId=<CloudFrontDistributionId> ElasticBeanstalkApplicationName=enterprise-auth ElasticBeanstalkEnvironmentName=enterprise-auth-prod `
     --region us-east-1
   ```

   Replace the angle-bracketed values. Set the GitHub repository secret
   `AWS_DEPLOY_ROLE_ARN` to the `GitHubDeployRoleArn` output. Set these
   repository Actions variables: `AWS_REGION`, `AWS_RELEASES_BUCKET`,
   `AWS_EB_APPLICATION_NAME`, `AWS_EB_ENVIRONMENT_NAME`, and
   `AWS_FRONTEND_DISTRIBUTION_ID`.
8. Push a commit to `main`. GitHub Actions publishes it to AWS and creates the
   first restore point. Verify login, 2FA, email setup links, user management,
   and incident reports on the CloudFront URL before changing your public
   frontend address. Keep Vercel available until that check passes, then turn
   off its automatic deployments.

The administrator restore page uses the Elastic Beanstalk instance role.
Local development needs AWS credentials from the standard AWS CLI profile
chain if you want to load or trigger restore points locally. Never put AWS
access keys in `backend/.env.example` or frontend variables.

The backend stores encrypted database backups in private Supabase Storage.
Application release history is separate and stored in the private S3 hosting
bucket. Set up the private Supabase bucket and `BACKUP_ENCRYPTION_KEY` as
described in [Encrypted Backups](#-encrypted-backups).
AWS charges for the running Beanstalk environment, S3 storage, and CloudFront
traffic. Check your account budget before enabling production resources.

Apply `database/cloud-only.sql` in the Supabase SQL Editor after deploying
schema changes. It adds the current application tables and fields, and disables
legacy change-capture triggers without deleting existing sync metadata or
database records. This migration adds the incident response and referral
timestamps used to lock reporter edits. Do not run `database/schema.sql` against an existing
production database. Local development connects directly to hosted Supabase,
so it does not need a local PostgreSQL server or a database sync process.

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
| Backup destination | AES-256-GCM encrypted snapshots in private Supabase Storage |
| Database | Hosted Supabase PostgreSQL for local development and production |
| Application restore | Elastic Beanstalk API rollback and CloudFront frontend rollback, database records unchanged |
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
| GET | `/api/system/backups` | JWT | Administrator |
| POST | `/api/system/backups` | JWT | Administrator |
| GET | `/api/system/restore-points` | JWT | Administrator |
| POST | `/api/system/restore-points` | JWT | Administrator |
| GET  | `/health` | None | — |
