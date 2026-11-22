-- Invitations: since v0.5.0 the only way to get an account. Open sign-up let
-- anyone learn which emails were registered (by signing up, then trying to log
-- in with the password they chose), so accounts are now created by accepting a
-- one-time invite that an admin, or the command line, issued.
CREATE TABLE invites (
    -- SHA-256 (hex) of the invite token. The token itself is shown once to the
    -- person who created the invite and never stored, like session tokens.
    token_hash  text        PRIMARY KEY,

    -- Normalised (trimmed, lower case) address the account will be created for.
    email       text        NOT NULL,

    role        text        NOT NULL DEFAULT 'reporter'
                CHECK (role IN ('reporter', 'analyst', 'admin')),

    -- The admin who issued it; NULL when issued from the command line, which is
    -- how the very first admin of a fresh database gets an account.
    created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,

    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,

    -- Set when accepted. An invite is usable once: accepting it sets this in
    -- the same statement that checks it is still NULL.
    used_at     timestamptz
);

CREATE INDEX invites_email_idx ON invites (email);
