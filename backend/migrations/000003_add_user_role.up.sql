-- Migration 000003 (up): add a role to users for role-based access control (RBAC).
-- Every user has exactly one role. New users default to the least-privileged role
-- ('reporter'); the CHECK constraint makes an invalid role impossible at the
-- database level, regardless of what the application sends.

ALTER TABLE users
    ADD COLUMN role text NOT NULL DEFAULT 'reporter'
        CHECK (role IN ('reporter', 'analyst', 'admin'));