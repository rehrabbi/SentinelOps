-- Migration 000005 (down): drop the audit log, its triggers and its functions.
-- Dropping the table takes its triggers and indexes with it; the functions are
-- separate objects and must be dropped explicitly.

DROP TABLE IF EXISTS audit_log;
DROP FUNCTION IF EXISTS audit_log_seal();
DROP FUNCTION IF EXISTS audit_log_immutable();