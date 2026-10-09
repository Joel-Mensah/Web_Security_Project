-- Non-destructive synchronization metadata and change capture.
-- Apply this after the application schema exists on both databases.

CREATE TABLE IF NOT EXISTS sync_node (
    singleton               BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    node_id                 UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    peer_cursor             BIGINT NOT NULL DEFAULT 0 CHECK (peer_cursor >= 0),
    initial_sync_completed  BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrap_started       BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrap_users_done    BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrap_audit_done    BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrap_users_cursor  UUID,
    bootstrap_audit_cursor  UUID
);

INSERT INTO sync_node (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_setup_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS password_setup_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS credential_setup_required BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET credential_setup_required = TRUE
WHERE credential_setup_required = FALSE
  AND password_setup_token_hash IS NOT NULL
  AND last_login_at IS NULL;

CREATE TABLE IF NOT EXISTS sync_outbox (
    id              BIGSERIAL PRIMARY KEY,
    origin_node_id  UUID NOT NULL,
    table_name      TEXT NOT NULL CHECK (table_name IN ('users', 'audit_logs')),
    operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    row_id          UUID NOT NULL,
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_table_row
    ON sync_outbox (table_name, row_id, id);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name          TEXT NOT NULL CHECK (table_name IN ('users', 'audit_logs')),
    row_id              UUID NOT NULL,
    local_event_id      BIGINT,
    remote_event_id     BIGINT,
    local_operation     TEXT NOT NULL CHECK (local_operation IN ('INSERT', 'UPDATE', 'DELETE', 'MISSING')),
    remote_operation    TEXT NOT NULL CHECK (remote_operation IN ('INSERT', 'UPDATE', 'DELETE', 'MISSING')),
    local_payload       JSONB,
    remote_payload      JSONB,
    status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolution          TEXT CHECK (resolution IN ('local', 'supabase')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open
    ON sync_conflicts (created_at DESC) WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_conflicts_open_events
    ON sync_conflicts (
        table_name,
        row_id,
        COALESCE(local_event_id, -1),
        COALESCE(remote_event_id, -1)
    ) WHERE status = 'open';

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.sync_apply', TRUE) IS DISTINCT FROM 'true' THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION capture_sync_change()
RETURNS TRIGGER AS $$
DECLARE
    v_payload JSONB;
    v_node_id UUID;
BEGIN
    IF current_setting('app.sync_apply', TRUE) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_payload := to_jsonb(OLD);
    ELSE
        v_payload := to_jsonb(NEW);
    END IF;

    SELECT node_id INTO STRICT v_node_id
    FROM sync_node
    WHERE singleton = TRUE;

    INSERT INTO sync_outbox (origin_node_id, table_name, operation, row_id, payload)
    VALUES (
        v_node_id,
        TG_TABLE_NAME,
        TG_OP,
        (v_payload ->> 'id')::UUID,
        v_payload
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_users ON users;
CREATE TRIGGER trg_sync_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_audit_logs ON audit_logs;
CREATE TRIGGER trg_sync_audit_logs
    AFTER INSERT OR UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION capture_sync_change();
