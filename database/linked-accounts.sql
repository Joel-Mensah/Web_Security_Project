-- Idempotent migration: user_linked_accounts (Integration Center / "Link This Site").
-- Run in the Supabase SQL Editor AFTER database/cloud-only.sql.
-- Companion full-schema definition lives in database/schema.sql.

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
