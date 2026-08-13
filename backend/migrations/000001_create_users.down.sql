-- Migration 000001 (down): undo the users table.
-- Dropping the table also drops its indexes.
DROP TABLE IF EXISTS users;
