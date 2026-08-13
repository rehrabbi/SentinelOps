package main

import (
	"database/sql"
	"fmt"
	"time"

	// The blank import runs the package's init(), which REGISTERS the "pgx"
	// driver with database/sql. We never call pgx directly — database/sql
	// looks it up by the name "pgx" in sql.Open below.
	_ "github.com/jackc/pgx/v5/stdlib"
)

// openDB prepares a connection POOL to Postgres from a DATABASE_URL like:
//
//	postgres://user:password@host:5432/dbname?sslmode=disable
//
// Important: sql.Open does NOT actually connect — it only validates the URL
// and sets up the pool. The first real network connection happens lazily, on
// the first query or Ping. That's why we can start the app even if the DB is
// momentarily down (and let /readyz report the truth).
func openDB(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	// Pool tuning — sensible small defaults for local development.
	db.SetMaxOpenConns(10)               // never more than 10 connections at once
	db.SetMaxIdleConns(5)                // keep up to 5 warm for reuse
	db.SetConnMaxLifetime(time.Hour)     // recycle a connection after an hour

	return db, nil
}
