package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"sentinelops/internal/auth"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
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

	// Where the browser frontend is served from. Must be an exact origin with
	// no trailing slash — it goes straight into the CORS headers.
	frontendOrigin := envOr("FRONTEND_ORIGIN", defaultFrontendOrigin)

	// A Secure cookie is only sent over HTTPS. Local dev is plain http, so this
	// defaults to false — but production MUST set SECURE_COOKIES=true, or the
	// session cookie would travel in cleartext.
	secureCookies := envBool("SECURE_COOKIES", false)

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

	// Users feature: wire the repository (SQL) to the handler (HTTP), then
	// register its routes. This is dependency injection by hand — main() is
	// where all the pieces are constructed and connected.
	userRepo := user.NewRepository(db)
	userHandler := user.NewHandler(userRepo)
	mux.HandleFunc("GET /api/users", userHandler.List)
	mux.HandleFunc("POST /api/users", userHandler.Create)

	// Auth feature: login reads a user AND writes a session, so it takes both
	// repositories. This is why auth is its own package rather than living
	// inside user or session.
	sessionRepo := session.NewRepository(db)
	authHandler := auth.NewHandler(userRepo, sessionRepo, secureCookies)
	mux.HandleFunc("POST /api/sessions", authHandler.Login)

	// Protected route: GET /api/me returns the current user. RequireAuth wraps
	// the Me handler, so an invalid/missing session is rejected with 401 before
	// Me runs. This is our first route that requires authentication.
	mux.Handle("GET /api/me", authHandler.RequireAuth(http.HandlerFunc(authHandler.Me)))

	// Wrap the router in CORS middleware so our browser frontend (and only
	// that origin) is allowed to read API responses.
	handler := withCORS(mux, frontendOrigin)

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

// defaultFrontendOrigin is used when FRONTEND_ORIGIN isn't set — the Vite dev
// server. A real deployment sets the env var to its actual origin.
const defaultFrontendOrigin = "http://localhost:5173"

// envOr returns an environment variable's value, or a fallback when unset.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envBool reads a boolean environment variable. An unset OR unparseable value
// falls back — and we log the bad value, because a silent fallback on a
// security flag like SECURE_COOKIES is exactly the kind of thing that ships to
// production unnoticed.
func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		log.Printf("config: %s=%q is not a valid boolean, using %v", key, v, fallback)
		return fallback
	}
	return b
}

// withCORS is middleware: it takes a handler and returns a NEW handler that
// runs shared logic — here, the CORS headers a browser needs — before
// delegating to the original handler. This is the classic Go middleware shape.
//
// allowedOrigin is always ONE named origin, never "*". Browsers forbid the
// wildcard alongside Allow-Credentials, because it would let any website on the
// internet call this API with the victim's session cookie attached.
func withCORS(next http.Handler, allowedOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Tell the browser this specific origin may read the response.
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		// Permit the browser to store and send our session cookie cross-origin.
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		// Signal to caches that the response depends on the Origin header.
		w.Header().Add("Vary", "Origin")

		// Preflight. Before a POST carrying a JSON body, the browser first
		// sends OPTIONS to ask permission. We must answer it HERE and stop:
		// the router only has GET/POST/DELETE patterns registered, so an
		// OPTIONS request would fall through to a 405 and fail the preflight.
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600") // cache permission 10 min
			w.WriteHeader(http.StatusNoContent)             // 204: permission granted, no body
			return
		}

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
