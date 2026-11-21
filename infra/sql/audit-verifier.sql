-- Creates audit_verifier: a login that can read audit_log and nothing else.
-- Only .github/workflows/audit-verify.yml uses it. If its password leaked, it
-- could read the audit trail but never change it, and could not see users,
-- sessions or incidents.
--
-- Run once against the production database. The password comes from the
-- VERIFIER_PASSWORD environment variable, so it never appears in this file,
-- on a command line, or in psql's output:
--   VERIFIER_PASSWORD=... psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/audit-verifier.sql
--
-- It is not a migration on purpose: the role only exists in production, and a
-- local database has no use for it.

-- Stop at the first error, even if the caller forgot -v ON_ERROR_STOP=1.
\set ON_ERROR_STOP on

\getenv verifier_password VERIFIER_PASSWORD
\if :{?verifier_password}
\else
  -- Raise an error rather than \quit, which would exit 0 as if it had worked.
  DO $$ BEGIN RAISE EXCEPTION 'VERIFIER_PASSWORD is not set'; END $$;
\endif

BEGIN;

-- NOINHERIT: it gains nothing from any role it might later be added to.
CREATE ROLE audit_verifier LOGIN NOINHERIT PASSWORD :'verifier_password';

-- Exactly what verify-audit needs: connect, find the table, read it.
GRANT CONNECT ON DATABASE sentinelops TO audit_verifier;
GRANT USAGE ON SCHEMA public TO audit_verifier;
GRANT SELECT ON TABLE audit_log TO audit_verifier;

COMMIT;
