-- =============================================================================
-- Enterprise Auth System — PostgreSQL Schema
-- =============================================================================

-- Drop existing objects (safe re-run)
DROP TABLE IF EXISTS audit_logs CASCADE;
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

-- ---------------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------------
COMMENT ON TABLE users       IS 'Core user accounts. Password salt stored per-user; pepper is env-only.';
COMMENT ON TABLE audit_logs  IS 'Immutable audit trail for all security-relevant events.';
COMMENT ON COLUMN users.salt IS 'Hex-encoded 16-byte cryptographically random salt. Never reused.';
COMMENT ON COLUMN users.mfa_secret IS 'Base32 speakeasy TOTP secret. Null until 2FA is set up.';
