-- =============================================================================
-- Enterprise Auth System — PostgreSQL Schema
-- =============================================================================

-- Drop existing objects (safe re-run)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS incident_updates CASCADE;
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS user_linked_accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ---------------------------------------------------------------------------
-- ENUM: role hierarchy
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('inputer', 'manager', 'admin', 'administrator');

-- ---------------------------------------------------------------------------
-- TABLE: users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(64)   NOT NULL UNIQUE,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password_hash TEXT          NOT NULL,
    salt          VARCHAR(64)   NOT NULL,       -- hex-encoded 16-byte random salt
    mfa_secret    TEXT,                          -- base32 TOTP secret (encrypted at-rest optional)
    mfa_enabled   BOOLEAN       NOT NULL DEFAULT FALSE,
    email_otp_hash TEXT,                         -- SHA-256 hash of temporary email OTP
    email_otp_expires_at TIMESTAMPTZ,            -- Expiry timestamp for email OTP (10 min TTL)
    password_setup_token_hash TEXT,
    password_setup_expires_at TIMESTAMPTZ,
    credential_setup_required BOOLEAN NOT NULL DEFAULT FALSE,
    role          user_role     NOT NULL DEFAULT 'inputer',
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_codes (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash  CHAR(64)    NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts   SMALLINT    NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts < 5)
);

-- Indexes for fast lookups
CREATE INDEX idx_users_username  ON users (username);
CREATE INDEX idx_users_email     ON users (email);
CREATE INDEX idx_users_role      ON users (role);
CREATE INDEX idx_users_is_active ON users (is_active);

-- ---------------------------------------------------------------------------
-- TABLE: audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID          REFERENCES users(id) ON DELETE SET NULL,
    actor_id    UUID          REFERENCES users(id) ON DELETE SET NULL, -- who performed the action
    action      VARCHAR(128)  NOT NULL,   -- e.g. 'LOGIN_SUCCESS', 'USER_DELETED', '2FA_FAILED'
    ip_address  INET,
    details     JSONB         DEFAULT '{}',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id    ON audit_logs (user_id);
CREATE INDEX idx_audit_actor_id   ON audit_logs (actor_id);
CREATE INDEX idx_audit_action     ON audit_logs (action);
CREATE INDEX idx_audit_created_at ON audit_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLES: security incidents and their activity timeline
-- ---------------------------------------------------------------------------
CREATE TABLE incidents (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    title              VARCHAR(160)  NOT NULL,
    description        TEXT          NOT NULL,
    category           VARCHAR(32)   NOT NULL CHECK (category IN (
                           'suspicious_email', 'account_compromise', 'lost_device',
                           'data_exposure', 'malware', 'policy_violation', 'other'
                       )),
    severity           VARCHAR(16)   NOT NULL DEFAULT 'medium' CHECK (
                           severity IN ('low', 'medium', 'high', 'critical')
                       ),
    status             VARCHAR(20)   NOT NULL DEFAULT 'new' CHECK (
                           status IN ('new', 'triaged', 'in_progress', 'resolved', 'closed')
                       ),
    reporter_id        UUID          REFERENCES users(id) ON DELETE SET NULL,
    assignee_id        UUID          REFERENCES users(id) ON DELETE SET NULL,
    resolution_summary TEXT,
    reporter_response_at TIMESTAMPTZ,
    referred_to_authority_at TIMESTAMPTZ,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ
);

CREATE INDEX idx_incidents_reporter_created
    ON incidents (reporter_id, created_at DESC);
CREATE INDEX idx_incidents_assignee_status
    ON incidents (assignee_id, status, updated_at DESC);
CREATE INDEX idx_incidents_status_severity
    ON incidents (status, severity, updated_at DESC);

CREATE TABLE incident_updates (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID          NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    actor_id    UUID          REFERENCES users(id) ON DELETE SET NULL,
    update_type VARCHAR(20)   NOT NULL CHECK (
                    update_type IN ('comment', 'status', 'assignment', 'severity', 'resolution')
                ),
    message     TEXT          NOT NULL,
    is_internal BOOLEAN       NOT NULL DEFAULT FALSE,
    details     JSONB         NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incident_updates_timeline
    ON incident_updates (incident_id, created_at);

-- ---------------------------------------------------------------------------
-- TABLE: user_linked_accounts (Integration Center / "Link This Site")
-- ---------------------------------------------------------------------------
CREATE TABLE user_linked_accounts (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                VARCHAR(32)   NOT NULL CHECK (provider IN (
                                'google', 'github', 'microsoft', 'slack', 'custom_saml'
                            )),
    provider_account_id     VARCHAR(255)  NOT NULL,
    provider_email          VARCHAR(255),
    access_token_encrypted  TEXT          NOT NULL,
    refresh_token_encrypted TEXT,
    metadata                JSONB         NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_linked_account_provider UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_linked_accounts_user
    ON user_linked_accounts (user_id, provider);
CREATE INDEX idx_linked_accounts_provider
    ON user_linked_accounts (provider, provider_account_id);

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-update updated_at on users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_incident_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_incident_updated_at_column();

-- ---------------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------------
COMMENT ON TABLE users       IS 'Core user accounts. Password salt stored per-user; pepper is env-only.';
COMMENT ON TABLE audit_logs  IS 'Immutable audit trail for all security-relevant events.';
COMMENT ON TABLE incidents IS 'Security incident reports and triage state.';
COMMENT ON TABLE incident_updates IS 'Public comments, private notes, and incident workflow history.';
COMMENT ON COLUMN users.salt IS 'Hex-encoded 16-byte cryptographically random salt. Never reused.';
COMMENT ON COLUMN users.mfa_secret IS 'Base32 speakeasy TOTP secret. Null until 2FA is set up.';
