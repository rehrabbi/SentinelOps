-- Migration 000005 (up): create the append-only, tamper-evident audit log.
--
-- This is NOT application logging. log.Printf exists so we can debug; this
-- exists to answer "who did what, to what, and when" long after the fact, for
-- someone who is not us.
--
-- Three protections, all enforced by the database rather than by convention:
--   1. every row is hash-chained to its predecessor, so edits are detectable
--   2. the chain is computed in a trigger, so the application cannot forge it
--   3. UPDATE, DELETE and TRUNCATE are refused outright

CREATE TABLE audit_log (
    id          bigserial   PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),

    -- Who acted. NULL actor_id for a failed login (no known user) or after the
    -- account is deleted. actor_email is a deliberate SNAPSHOT: the entry must
    -- still name the actor once the user row is gone or the address has changed.
    actor_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
    actor_email text        NOT NULL,

    -- Dotted action name: 'user.login', 'user.login_failed', 'user.logout',
    -- 'user.role_changed'.
    action      text        NOT NULL,

    -- What it happened to. target_id is text, not uuid, because the audit trail
    -- must not depend on the target still existing. Referential integrity is
    -- traded for durability on purpose.
    target_type text,
    target_id   text,

    outcome     text        NOT NULL
                    CHECK (outcome IN ('success', 'failure')),

    -- Action-specific fields, e.g. {"from":"reporter","to":"admin"}. A new kind
    -- of event later is a new action string plus new keys, with no migration.
    detail      jsonb       NOT NULL DEFAULT '{}',

    -- The direct peer address. Trustworthy while nothing sits in front of the
    -- API. Behind a proxy this becomes the proxy, and X-Forwarded-For is
    -- client-controlled and must never be trusted blindly.
    ip          inet,

    -- The chain. Both are filled in by the trigger below; the application never
    -- supplies them.
    prev_hash   bytea,
    entry_hash  bytea
);

-- Read newest-first, by actor during an investigation, or by action to answer
-- "show me every failed login".
CREATE INDEX audit_log_occurred_at_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_actor_id_idx    ON audit_log (actor_id);
CREATE INDEX audit_log_action_idx      ON audit_log (action);


-- Seal each new row into the chain. BEFORE INSERT, so the values are computed
-- here and anything the application sent for prev_hash/entry_hash is discarded.
CREATE OR REPLACE FUNCTION audit_log_seal() RETURNS trigger AS $$
DECLARE
    last_hash bytea;
    payload   text;
BEGIN
    -- Serialize audit inserts. Without this, two concurrent writers could read
    -- the same chain tail and fork it. Released automatically at commit.
    PERFORM pg_advisory_xact_lock(hashtext('audit_log'));

    SELECT entry_hash INTO last_hash FROM audit_log ORDER BY id DESC LIMIT 1;
    NEW.prev_hash := last_hash;

    -- Canonical serialization. to_char with an explicit UTC format is used
    -- rather than a plain cast, because casting a timestamp to text depends on
    -- the session DateStyle, which would make the same row hash differently in
    -- another session. jsonb already stores keys in a normalized order, so its
    -- text form is stable.
    payload := concat_ws('|',
        to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
        coalesce(NEW.actor_id::text, ''),
        NEW.actor_email,
        NEW.action,
        coalesce(NEW.target_type, ''),
        coalesce(NEW.target_id, ''),
        NEW.outcome,
        NEW.detail::text,
        coalesce(NEW.ip::text, '')
    );

    NEW.entry_hash := sha256(coalesce(last_hash, ''::bytea) || convert_to(payload, 'UTF8'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_seal_before_insert
    BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_seal();


-- Append-only, enforced. Note the TRUNCATE trigger: TRUNCATE skips row-level
-- triggers entirely and is the obvious way around a row-level block.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();