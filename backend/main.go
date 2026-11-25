package main

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"sentinelops/internal/audit"
	"sentinelops/internal/reqlog"
)

// main is the entry point of every Go program. It sets up the HTTP
// server and starts listening for requests.
func main() {
	// Subcommand: "healthcheck" asks the already-running server whether it is
	// alive, and exits 0 if so, 1 if not. Docker runs it inside the container,
	// where the distroless image has no shell or curl to do the same job.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://127.0.0.1:8080/healthz")
		if err != nil {
			log.Fatalf("healthcheck failed: %v", err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			log.Fatalf("healthcheck failed: status %d", resp.StatusCode)
		}
		return
	}

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

	// The secret the Cloudflare proxy sends with every request. Empty means
	// there is no proxy (local development), and the check is switched off.
	// During a rotation there is also the previous one (see proxySecrets).
	proxySecret, proxySecretPrevious, err := proxySecrets(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
	if proxySecret == "" {
		log.Println("PROXY_SECRET not set: direct requests allowed (local development only)")
	}
	// It is meant to exist for minutes, so its presence is announced at every start.
	if proxySecretPrevious != "" {
		log.Println("PROXY_SECRET_PREVIOUS is set: the previous proxy secret is still accepted; " +
			"remove it once no request log line shows proxy_secret=previous")
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

	// Subcommand: "verify-audit" walks the audit hash chain and exits non-zero
	// if it is broken, so it can be run from a scheduled job or a CI step.
	// Record the head hash somewhere outside this database: that is what turns
	// tamper evidence into something an attacker with database access cannot
	// quietly defeat by rebuilding the chain.
	//
	// With --anchor <id>:<hash>, an earlier head printed by this command, it
	// also checks that entry still carries that hash, which catches a chain
	// rebuilt from scratch. The scheduled audit-verify workflow passes the last
	// anchor it recorded.
	if len(os.Args) > 1 && os.Args[1] == "verify-audit" {
		flags := flag.NewFlagSet("verify-audit", flag.ExitOnError)
		anchorText := flags.String("anchor", "", "an earlier head, <id>:<hash>, that must still be in the chain")
		_ = flags.Parse(os.Args[2:]) // ExitOnError: a bad flag exits before this returns

		// Parse the anchor before touching the database, so a typo fails fast.
		var anchor *audit.Anchor
		if *anchorText != "" {
			a, err := audit.ParseAnchor(*anchorText)
			if err != nil {
				log.Fatalf("audit verification failed: %v", err)
			}
			anchor = &a
		}

		ctx := context.Background()
		report, err := audit.Verify(ctx, db)
		if err != nil {
			log.Fatalf("audit verification failed: %v", err)
		}
		if !report.Intact() {
			log.Fatalf("audit chain BROKEN: %d entries, first bad id %d", report.Entries, report.FirstBad)
		}
		// Checked even when the table is empty: an anchored entry that vanished
		// is exactly what a wiped or rebuilt log looks like.
		if anchor != nil {
			if err := audit.CheckAnchor(ctx, db, *anchor); err != nil {
				log.Fatalf("audit chain BROKEN: %v", err)
			}
			log.Printf("anchor %s still holds", anchor)
		}
		if report.Entries == 0 {
			log.Println("audit chain: empty, nothing to verify")
			return
		}
		head := audit.Anchor{ID: report.HeadID, Hash: report.HeadHash}
		log.Printf("audit chain intact: %d entries, head %s", report.Entries, head)
		return
	}

	// Subcommand: "invite" issues a one-time invite from the command line and
	// prints its link (see cli.go). With no open sign-up, this is how the first
	// admin of a fresh database gets an account.
	if len(os.Args) > 1 && os.Args[1] == "invite" {
		if err := runInvite(context.Background(), db, os.Args[2:], os.Stdout); err != nil {
			log.Fatalf("invite failed: %v", err)
		}
		return
	}

	// Subcommand: "reset-password" issues a one-time reset link from the
	// command line (see cli.go): the way back in when the only admin has
	// forgotten their password.
	if len(os.Args) > 1 && os.Args[1] == "reset-password" {
		if err := runResetPassword(context.Background(), db, os.Args[2:], os.Stdout); err != nil {
			log.Fatalf("reset-password failed: %v", err)
		}
		return
	}

	// From here on the process is the server, so everything it logs, including
	// the existing log.Printf calls, is one JSON object per line on stderr,
	// which Render collects. The subcommands above keep plain, readable text.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))

	// Every route, middleware and dependency is wired in newHandler (server.go),
	// so the integration tests serve exactly the same API this process does.
	handler := newHandler(db, serverConfig{
		FrontendOrigin:      frontendOrigin,
		SecureCookies:       secureCookies,
		ProxySecret:         proxySecret,
		ProxySecretPrevious: proxySecretPrevious,
	})

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
		// the router has no OPTIONS patterns registered, so an OPTIONS
		// request would fall through to a 405 and fail the preflight. Every
		// method a route uses must be listed, or the browser refuses it.
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600") // cache permission 10 min
			w.WriteHeader(http.StatusNoContent)             // 204: permission granted, no body
			return
		}

		// Hand off to the wrapped handler (our router).
		next.ServeHTTP(w, r)
	})
}

// proxySecretHeader carries the secret shared with the Cloudflare proxy, and
// clientIPHeader the visitor's address, which the proxy always sets itself.
const (
	proxySecretHeader = "X-Proxy-Secret"
	clientIPHeader    = "X-Client-IP"
)

// proxySecrets reads PROXY_SECRET and, during a rotation, PROXY_SECRET_PREVIOUS:
// the secret the proxy used until now, also accepted so the API and the proxy
// can switch one after the other without refusing anyone (docs/RUNBOOK.md).
//
// A previous secret without a current one is refused. An empty PROXY_SECRET
// switches the check off entirely, so starting anyway would let every request
// in while whoever set the previous secret believes one is enforced.
func proxySecrets(getenv func(string) string) (current, previous string, err error) {
	current, previous = getenv("PROXY_SECRET"), getenv("PROXY_SECRET_PREVIOUS")
	if previous != "" && current == "" {
		return "", "", errors.New("PROXY_SECRET_PREVIOUS is set without PROXY_SECRET: refusing to start")
	}
	return current, previous, nil
}

// requireProxySecret is middleware that lets a request through only if it
// carries the secret shared with the Cloudflare proxy. In production the API's
// own address is public, so without this anyone could skip the proxy and talk
// to the API directly. /healthz stays open because Render's health checks do
// not come through the proxy.
//
// An empty secret switches the check off, for local development and compose,
// where there is no proxy. Production must always set PROXY_SECRET.
//
// previous, when not empty, is accepted as well: the secret the proxy sent
// until a rotation began. Requests it lets in are marked in the request log,
// so it is clear when the proxy has switched and it can be removed.
func requireProxySecret(next http.Handler, secret, previous string) http.Handler {
	if secret == "" {
		return next
	}
	want := []byte(secret)
	var old []byte
	if previous != "" {
		old = []byte(previous)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		got := []byte(r.Header.Get(proxySecretHeader))
		// ConstantTimeCompare takes the same time however many bytes match,
		// so the secret cannot be guessed one byte at a time by timing replies.
		// Both comparisons always run, so the time taken does not reveal
		// which secret matched either.
		current := subtle.ConstantTimeCompare(got, want) == 1
		usedPrevious := old != nil && subtle.ConstantTimeCompare(got, old) == 1
		if !current && !usedPrevious {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !current {
			reqlog.MarkPreviousSecret(r.Context())
		}
		// The proxy reports the visitor's address in a header it sets itself.
		// It is believed only here, after the secret proved the request came
		// through the proxy; a client calling the API directly never gets this
		// far. ClientIP still parses it before it reaches the audit log.
		if ip := r.Header.Get(clientIPHeader); ip != "" {
			r = r.WithContext(audit.WithTrustedClientIP(r.Context(), ip))
		}
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
