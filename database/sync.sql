-- DEPRECATED: Do not run this migration for current deployments.
-- It creates database synchronization metadata and change-capture triggers.
-- Supabase-only deployments should apply cloud-only.sql instead.

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
    bootstrap_incidents_done BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrap_incident_updates_done BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrap_users_cursor  UUID,
    bootstrap_audit_cursor  UUID,
    bootstrap_incidents_cursor UUID,
    bootstrap_incident_updates_cursor UUID
);

ALTER TABLE sync_node
    ADD COLUMN IF NOT EXISTS bootstrap_incidents_done BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS bootstrap_incident_updates_done BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS bootstrap_incidents_cursor UUID,
    ADD COLUMN IF NOT EXISTS bootstrap_incident_updates_cursor UUID;

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

ALTER TABLE sync_outbox DROP CONSTRAINT IF EXISTS sync_outbox_table_name_check;
ALTER TABLE sync_outbox ADD CONSTRAINT sync_outbox_table_name_check
    CHECK (table_name IN ('users', 'audit_logs', 'incidents', 'incident_updates'));

ALTER TABLE sync_conflicts DROP CONSTRAINT IF EXISTS sync_conflicts_table_name_check;
ALTER TABLE sync_conflicts ADD CONSTRAINT sync_conflicts_table_name_check
    CHECK (table_name IN ('users', 'audit_logs', 'incidents', 'incident_updates'));

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

DROP TRIGGER IF EXISTS trg_sync_incidents ON incidents;
CREATE TRIGGER trg_sync_incidents
    AFTER INSERT OR UPDATE OR DELETE ON incidents
    FOR EACH ROW EXECUTE FUNCTION capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_incident_updates ON incident_updates;
CREATE TRIGGER trg_sync_incident_updates
    AFTER INSERT OR UPDATE OR DELETE ON incident_updates
    FOR EACH ROW EXECUTE FUNCTION capture_sync_change();

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
