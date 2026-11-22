-- Creates backup_reader: a login that can read every table and change nothing.
-- Only .github/workflows/backup.yml uses it, to run pg_dump. If its password
-- leaked, the data could be read (as the backups themselves can, once
-- decrypted) but never altered or deleted.
--
-- Run once against the production database, as the database owner. The
-- password comes from the BACKUP_PASSWORD environment variable, so it never
-- appears in this file, on a command line, or in psql's output:
--   BACKUP_PASSWORD=... psql "$PROD_DATABASE_URL" -f infra/sql/backup-reader.sql

\set ON_ERROR_STOP on

\getenv backup_password BACKUP_PASSWORD
\if :{?backup_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'BACKUP_PASSWORD is not set'; END $$;
\endif

BEGIN;

CREATE ROLE backup_reader LOGIN NOINHERIT PASSWORD :'backup_password';

GRANT CONNECT ON DATABASE sentinelops TO backup_reader;
GRANT USAGE ON SCHEMA public TO backup_reader;
-- pg_dump reads every table and the current value of every sequence.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader;
-- Tables that future migrations create (as the owner running this script)
-- are readable too, so a new table can never silently fall out of backups.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_reader;

COMMIT;
