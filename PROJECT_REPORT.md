# Enterprise Authentication & RBAC System — Full Project Report

Repo: Joel-Mensah/Web_Security_Project | Branch: main
Stack: Node.js 18+ | Express 4 | React 18 (web) + React 19 (mobile) | Supabase Postgres | Expo SDK 58 | Capacitor 7 | AWS (Elastic Beanstalk + S3 + CloudFront)
Scope: Secure identity platform with RBAC, MFA, incident response, audit logging, encrypted backups, and deployment automation.

## 1. Overview

This repository implements an enterprise-grade authentication and access-control platform designed for internal security operations. The system supports user lifecycle management, multi-factor authentication, incident triage, and operational restore workflows in a single application stack.

It includes:
- Secure user authentication with password setup and reset
- TOTP plus email OTP as backup multi-factor flows
- Role-based authorization across users, system settings, and incidents
- Security incident reporting with evidence uploads and private notes
- Backup and restore tooling with encryption and AWS-oriented restore metadata
- A React web frontend and a mobile Expo app for on-the-go access

## 2. Architecture

- backend/ : Express API served on port 5000 with Helmet, CORS, rate limiting, health checks, JWT validation, and database enforcement
  - src/routes/ : auth, users, incidents, system, sync, and account linkage operations
  - src/services/ : crypto, TOTP, OTP, email, audit, backup, evidence, AWS restore, and sync services
  - src/middleware/ : authentication, role enforcement, and database availability checks
  - src/scripts/ : admin seeders, demo user seeders, backup runner, and AWS deploy scripts
  - src/config/db.js : PostgreSQL connection layer pointing at Supabase
- frontend/ : Vite + React + Tailwind web frontend with secure role-aware pages and API client setup
- mobile/enterprise-auth-mobile/ : Capacitor 7 reference app retained for compatibility
- mobile/expo-app/ : Expo SDK 58 application mirroring core authentication and incident screens
- database/ : schema and migration scripts for fresh and additive deployments
- infra/aws/ : hosting and deployment policy templates
- .github/workflows/aws-deploy.yml : CI/CD deployment workflow

The system’s flow is: UI -> API -> JWT + RBAC validation -> Supabase Postgres. Backups are encrypted before being staged to private storage, while restore points are recorded for AWS rollback workflows.

## 3. Backend Functionality

### Authentication layer
The auth API handles credential verification, MFA initialization, and password recovery:
- `POST /api/auth/setup-password` : complete first-time password creation
- `POST /api/auth/login` : verify credentials and issue a pending 2FA JWT
- `POST /api/auth/request-password-reset` : issue a time-bound reset code
- `POST /api/auth/reset-password` : validate code and replace the stored hash
- `POST /api/auth/setup-2fa` : generate TOTP secret and QR payload
- `POST /api/auth/verify-2fa` : validate TOTP and issue full session JWT
- `POST /api/auth/send-email-otp` : send a six-digit fallback OTP
- `POST /api/auth/verify-email-otp` : verify OTP and issue session JWT
- `POST /api/auth/logout` : audit the logout event
- `GET /api/auth/me` : fetch current user details for validation

### User and RBAC management
The user API exposes role-aware administration:
- `GET /api/users` : list authorized users
- `GET /api/users/:id` : fetch user profile
- `GET /api/users/logs/audit` : access audit activity for admins
- `GET /api/users/status/setup` : determine setup completeness
- `POST /api/users` : create an account as permitted by role
- `POST /api/users/:id/send-setup-link` : send onboarding link
- `DELETE /api/users/:id` : delete a user under applicable permission
- `PATCH /api/users/:id/role` : modify roles
- `GET /api/users/export` : export users as CSV

Roles support a clear hierarchy:
- Inputer < Manager < Admin < Administrator

### Incident reporting and response
The incidents API supports enterprise security reporting workflows:
- `GET /api/incidents/summary` : role-scoped counts and incident totals
- `GET /api/incidents/assignees` : list responders available for assignment
- `GET /api/incidents` : paginated queue with filters and search
- `POST /api/incidents` : create a report with validation and evidence upload
- `GET /api/incidents/:id` : read report details and timeline
- `PATCH /api/incidents/:id` : allow reporter edits before follow-up or referral
- `GET /api/incidents/:id/evidence/:evidenceId` : retrieve signed evidence URLs
- `PATCH /api/incidents/:id/triage` : assign severity, status, and responder
- `POST /api/incidents/:id/updates` : add public comments or private notes

### System and backup operations
System endpoints support operational functions:
- `GET /api/system/backups` : list existing backup records
- `POST /api/system/backups` : trigger encrypted backup to storage
- `GET /api/system/restore-points` : view rollback metadata
- `POST /api/system/restore-points` : register restore information

## 4. Security Model

The project is designed around defense-in-depth:
- Argon2id hashing with per-user salt and secret pepper stored outside the database
- TOTP validation with ±1 time-window tolerance and short-lived JWTs
- Email OTP fallback with limited validity and attempt caps
- Generic password reset responses to reduce account enumeration risk
- Role checks enforced by middleware and frontend route gating
- Helmet, CORS, request size caps, and rate limiting at the server layer
- Parameterized SQL queries and strict data validation
- Encrypted storage backups using AES-256-GCM
- Full audit trail for user and security actions

## 5. Web and Mobile Experience

### Frontend web app
The web app is built in React 18 with Vite and Tailwind and includes:
- login flow with MFA and recovery steps
- dashboard and permission summary
- incident queue, triage, and timeline views
- user directory and admin actions
- system operations views for backup and restore actions

### Mobile apps
Two mobile implementations are present:
- `mobile/enterprise-auth-mobile/` : older Capacitor app retained for reference
- `mobile/expo-app/` : newer Expo SDK 58 app with secure storage and mobile-auth flow parity

The Expo app includes:
- secure token handling
- login and MFA screens
- incident viewing and reporting
- dashboard and profile access
- LAN-based API connectivity with environment override support

## 6. Database and Deployment

### Database
- `database/schema.sql` : full DDL for a fresh Supabase instance
- `database/cloud-only.sql` : additive migration for existing environments
- `database/sync.sql` : legacy sync metadata support

### AWS and infrastructure
- `infra/aws/hosting.yaml` : Elastic Beanstalk and CDN hosting config
- `infra/aws/github-deploy-role.yaml` : deployment permissions for CI
- `infra/aws/backend-restore-role.yaml` : least-privilege restore access
- `.github/workflows/aws-deploy.yml` : automated deployment pipeline

## 7. Testing and Quality

The project includes backend tests covering:
- authorization middleware
- user management workflows
- incident lifecycle handling
- evidence handling and backup logic
- sync and restore service behaviors

Tests are designed to validate the most critical security and operational flows before deployment.

## 8. Risks, Gaps, and Next Steps

Current areas to continue improving:
1. Validate Expo connectivity and mobile API setup in the target test network.
2. Expand mobile parity to cover admin and system workflows.
3. Add richer photo and evidence upload support to the native app.
4. Finalize production environment secrets and AWS deployment configuration.
5. Keep the older Capacitor app only if there is still a business need for legacy support.

## 9. Summary

This project is a full-stack enterprise authentication and incident response platform with secure identity management, role-based controls, auditability, and operational resilience. It combines a hardened backend, a role-aware web UI, mobile access, and infrastructure automation suitable for a modern enterprise deployment model.


