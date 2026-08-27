-- Migration 000004 (up): create the incidents table (the core ticket domain).
-- Each incident is owned by the user who created it (user_id). That ownership
-- column drives authorization: reporters see only their own rows; analysts and
-- admins see all. ON DELETE RESTRICT protects the audit trail — a user with
-- incidents cannot be deleted until those incidents are dealt with (unlike
-- sessions, which cascade because they are disposable).

CREATE TABLE incidents (
    id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title           text    NOT NULL,
    description     text    NOT NULL DEFAULT '',
    status          text    NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
    severity        text    NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- We filter incidents by owner constantly (a reporter's "my incidents") and by
-- status for triage views; index both.

CREATE INDEX incidents_user_id_idx ON incidents (user_id);
CREATE INDEX incidents_status_idx ON incidents (status);