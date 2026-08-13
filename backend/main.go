package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

// main is the entry point of every Go program. It sets up the HTTP
// server and starts listening for requests.
func main() {
	// Read the database connection string from the environment (12-factor
	// config). We never hard-code credentials; if it's missing, fail loudly.
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	// Open the connection pool. This does NOT connect yet — it just prepares
	// the pool; the first real connection happens on the first query/ping.
	db, err := openDB(databaseURL)
	if err != nil {
		log.Fatalf("database setup failed: %v", err)
	}
	defer db.Close()

	// Subcommand: "migrate" applies pending DB migrations, then exits.
	// Run with:  api.exe migrate   (or during dev: go run . migrate)
	// We keep migrations a separate, explicit step rather than auto-running
	// them on server startup — schema changes should be deliberate.
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err := runMigrateUp(db); err != nil {
			log.Fatalf("migration failed: %v", err)
		}
		log.Println("migrations applied successfully")
		return
	}

	// A ServeMux ("multiplexer" / router) inspects each incoming
	// request and decides which handler function should answer it.
	mux := http.NewServeMux()

	// Liveness — "is the process up?" Does NOT touch the database.
	mux.HandleFunc("GET /healthz", healthHandler)

	// Readiness — "can we serve real traffic?" Pings the database.
	mux.HandleFunc("GET /readyz", readyHandler(db))

	// Wrap the router in CORS middleware so our browser frontend (and only
	// that origin) is allowed to read API responses.
	handler := withCORS(mux)

	// The address the server listens on. ":8080" means "all network
	// interfaces on this machine, port 8080".
	addr := ":8080"
	log.Printf("SentinelOps API listening on %s", addr)

	// ListenAndServe blocks (runs forever) serving requests. It only
	// returns if the server fails to start or crashes — so if we get
	// an error here, we log it and exit.
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server failed to start: %v", err)
	}
}

// allowedOrigin is the ONLY origin a browser is permitted to read this API
// from. Least privilege: we name exactly who is allowed, nothing more.
// (Later we'll make this configurable via an environment variable.)
const allowedOrigin = "http://localhost:5173"

// withCORS is middleware: it takes a handler and returns a NEW handler that
// runs shared logic — here, adding the CORS headers a browser needs — before
// delegating to the original handler. This is the classic Go middleware shape.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Tell the browser this specific origin may read the response.
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		// Signal to caches that the response depends on the Origin header.
		w.Header().Add("Vary", "Origin")

		// Hand off to the wrapped handler (our router).
		next.ServeHTTP(w, r)
	})
}

// healthHandler answers "is this service alive?" with a small JSON body.
// w = where we WRITE the response; r = the incoming request (unused here).
func healthHandler(w http.ResponseWriter, r *http.Request) {
	// Tell the client the body is JSON so it parses it correctly.
	w.Header().Set("Content-Type", "application/json")

	// Set the HTTP status line to 200 OK.
	w.WriteHeader(http.StatusOK)

	// Encode a Go map as JSON and write it directly to the response.
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// readyHandler reports whether the service can serve real traffic. It takes
// the DB pool and returns a handler (a closure) that pings the database on
// each call: DB reachable -> 200 ready; DB unreachable -> 503 unavailable.
func readyHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Bound the check with a timeout so a hung DB can't hang the request.
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		w.Header().Set("Content-Type", "application/json")
		if err := db.PingContext(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable) // 503
			json.NewEncoder(w).Encode(map[string]string{"status": "unavailable"})
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
	}
}
