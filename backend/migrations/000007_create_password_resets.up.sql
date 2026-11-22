-- Admin-issued password resets. With no email, a forgotten password used to be
-- a permanent lockout; now an admin issues a one-time link that lets the
-- account's owner choose a new password. Mirrors invites (migration 6).
CREATE TABLE password_resets (
    -- SHA-256 (hex) of the reset token. The token itself is shown once to the
    -- admin who issued it and never stored.
    token_hash  text        PRIMARY KEY,

    -- The account whose password it resets. Deleting the account deletes its
    -- pending resets.
    user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The admin who issued it.
    created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,

    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,

    -- Set when used. A reset works once: using it sets this in the same
    -- statement that checks it is still NULL.
    used_at     timestamptz
);

CREATE INDEX password_resets_user_id_idx ON password_resets (user_id);
