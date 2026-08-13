package main

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	migratepgx "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// migrationsFS embeds every .sql file under migrations/ INTO the compiled
// binary. Deploying the app therefore also ships its migrations — there are
// no loose SQL files to copy around, which matters for containers later.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// runMigrateUp applies all pending "up" migrations, in version order. It is a
// no-op if the database is already at the latest version.
func runMigrateUp(db *sql.DB) error {
	// Source of migrations: the embedded SQL files.
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("load migration files: %w", err)
	}

	// Database side: wrap our existing *sql.DB pool so migrate can execute the
	// SQL and record applied versions in a schema_migrations table.
	driver, err := migratepgx.WithInstance(db, &migratepgx.Config{})
	if err != nil {
		return fmt.Errorf("create migrate driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", src, "pgx", driver)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}

	// ErrNoChange simply means "already up to date" — not a real failure.
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
