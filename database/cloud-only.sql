-- Idempotent migration for the single hosted Supabase database.
-- Existing sync metadata tables are left intact, but old change-capture triggers are removed.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_setup_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS password_setup_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS credential_setup_required BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET credential_setup_required = TRUE
WHERE credential_setup_required = FALSE
  AND password_setup_token_hash IS NOT NULL
  AND last_login_at IS NULL;

UPDATE users
SET credential_setup_required = (
    password_setup_token_hash IS NOT NULL
    AND last_login_at IS NULL
)
WHERE credential_setup_required IS NULL;

ALTER TABLE users
    ALTER COLUMN credential_setup_required SET DEFAULT FALSE,
    ALTER COLUMN credential_setup_required SET NOT NULL;

CREATE TABLE IF NOT EXISTS password_reset_codes (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash  CHAR(64)    NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts   SMALLINT    NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts < 5)
);

CREATE TABLE IF NOT EXISTS incidents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              VARCHAR(160) NOT NULL,
    description        TEXT NOT NULL,
    category           VARCHAR(32) NOT NULL CHECK (category IN (
                           'suspicious_email', 'account_compromise', 'lost_device',
                           'data_exposure', 'malware', 'policy_violation', 'other'
                       )),
    severity           VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (
                           severity IN ('low', 'medium', 'high', 'critical')
                       ),
    status             VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (
                           status IN ('new', 'triaged', 'in_progress', 'resolved', 'closed')
                       ),
    reporter_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    assignee_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_summary TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ
);

ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS reporter_response_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS referred_to_authority_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS incident_updates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    update_type VARCHAR(20) NOT NULL CHECK (
                    update_type IN ('comment', 'status', 'assignment', 'severity', 'resolution')
                ),
    message     TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE incidents i
SET reporter_response_at = replies.first_reply_at
FROM (
    SELECT updates.incident_id, MIN(updates.created_at) AS first_reply_at
    FROM incident_updates updates
    JOIN users responders ON responders.id = updates.actor_id
    WHERE updates.update_type = 'comment'
      AND updates.is_internal = FALSE
      AND responders.role IN ('manager', 'admin', 'administrator')
    GROUP BY updates.incident_id
) replies
WHERE i.id = replies.incident_id
  AND i.reporter_response_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_reporter_created
    ON incidents (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_assignee_status
    ON incidents (assignee_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status_severity
    ON incidents (status, severity, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_updates_timeline
    ON incident_updates (incident_id, created_at);

DROP TRIGGER IF EXISTS trg_sync_users ON users;
DROP TRIGGER IF EXISTS trg_sync_audit_logs ON audit_logs;
DROP TRIGGER IF EXISTS trg_sync_incidents ON incidents;
DROP TRIGGER IF EXISTS trg_sync_incident_updates ON incident_updates;
DROP FUNCTION IF EXISTS capture_sync_change();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Integration Center linked accounts.
-- Kept in sync with database/linked-accounts.sql for existing deployments.
CREATE TABLE IF NOT EXISTS user_linked_accounts (
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

CREATE INDEX IF NOT EXISTS idx_linked_accounts_user
    ON user_linked_accounts (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_provider
    ON user_linked_accounts (provider, provider_account_id);

DROP TRIGGER IF EXISTS trg_linked_accounts_updated_at ON user_linked_accounts;
CREATE TRIGGER trg_linked_accounts_updated_at
    BEFORE UPDATE ON user_linked_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
