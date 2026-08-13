-- Migration 000001 (up): create the application users table.

CREATE TABLE users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text        NOT NULL,
    password_hash text        NOT NULL,
    full_name     text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Enforce case-insensitive uniqueness of email at the database level, so
-- "Foo@example.com" and "foo@example.com" cannot both exist.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
