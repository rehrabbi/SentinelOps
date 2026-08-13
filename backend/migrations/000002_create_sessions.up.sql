-- Sessions for cookie-based authentication. We store only the SHA-256 hash of
-- each session token (never the raw token), so a leak of this table can't be
-- used to impersonate users.
CREATE TABLE sessions (
    token_hash  text        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

-- Find/delete all of one user's sessions (e.g. "log out everywhere").
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Efficiently sweep expired sessions in a future cleanup job.
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);