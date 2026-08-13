package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// main is the entry point of every Go program. It sets up the HTTP
// server and starts listening for requests.
func main() {
	// A ServeMux ("multiplexer" / router) inspects each incoming
	// request and decides which handler function should answer it.
	mux := http.NewServeMux()

	// Register our health-check handler. The "GET /healthz" pattern
	// (Go 1.22+) matches ONLY GET requests to the /healthz path.
	mux.HandleFunc("GET /healthz", healthHandler)

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
