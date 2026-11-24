// Package reqlog writes one structured (JSON) log line per HTTP request, so
// "what happened at 14:05?" and "why did this request fail?" have answers.
//
// What a line holds: a request ID (also returned to the caller as
// X-Request-ID), the method, the path without its query string, the status,
// the duration, the bytes sent, the visitor key, the user ID when someone is
// logged in, and proxy_secret "previous" when a request came in with the
// previous proxy secret during a rotation. What it never holds: cookies, headers such as X-Proxy-Secret
// or Authorization, query strings, or request and response bodies, which is
// where passwords and invite tokens travel.
package reqlog

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"
)

// maxPathLen caps the logged path, so a client cannot flood the log with an
// enormous URL. The JSON encoding already neutralises newlines and quotes.
const maxPathLen = 256

// slot carries what is only known deeper inside the handler chain back out to
// the logger: the visitor key (set after the proxy check has decided whether
// to trust the forwarded address), the logged-in user (set by RequireAuth),
// and whether the previous proxy secret let the request in.
type slot struct {
	visitor        string
	userID         string
	previousSecret bool
}

type slotKey struct{}

// SetVisitor records the visitor key for this request's log line.
func SetVisitor(ctx context.Context, visitor string) {
	if s, ok := ctx.Value(slotKey{}).(*slot); ok {
		s.visitor = visitor
	}
}

// SetUser records the logged-in user's ID for this request's log line. It is
// the opaque UUID, never the email.
func SetUser(ctx context.Context, userID string) {
	if s, ok := ctx.Value(slotKey{}).(*slot); ok {
		s.userID = userID
	}
}

// MarkPreviousSecret records that this request was let in by the previous
// proxy secret, which is accepted only while a rotation is under way. When no
// line carries the mark any more, the proxy has switched to the new secret
// and the previous one can be removed. The secret itself is never logged.
func MarkPreviousSecret(ctx context.Context) {
	if s, ok := ctx.Value(slotKey{}).(*slot); ok {
		s.previousSecret = true
	}
}

// Middleware logs every request that passes through it. Wrap the whole API
// with it, outermost, so requests refused by inner checks are logged too.
// visitor gives the key to use until an inner layer sets a better one.
func Middleware(logger *slog.Logger, visitor func(*http.Request) string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Always generated here, never taken from the request: a client-sent
		// ID could be forged to make one request's line look like another's.
		id := newID()
		w.Header().Set("X-Request-ID", id)

		s := &slot{visitor: visitor(r)}
		rec := &recorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r.WithContext(context.WithValue(r.Context(), slotKey{}, s)))

		path := r.URL.Path
		if len(path) > maxPathLen {
			path = path[:maxPathLen] + "…"
		}
		attrs := []slog.Attr{
			slog.String("request_id", id),
			slog.String("method", r.Method),
			slog.String("path", path),
			slog.Int("status", rec.status),
			slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
			slog.Int64("bytes", rec.bytes),
			slog.String("visitor", s.visitor),
		}
		if s.userID != "" {
			attrs = append(attrs, slog.String("user_id", s.userID))
		}
		if s.previousSecret {
			attrs = append(attrs, slog.String("proxy_secret", "previous"))
		}
		level := slog.LevelInfo
		switch {
		case rec.status >= 500:
			level = slog.LevelError
		case rec.status >= 400:
			level = slog.LevelWarn
		}
		logger.LogAttrs(r.Context(), level, "request", attrs...)
	})
}

// newID returns 16 random hex characters, enough to tell requests apart.
func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "unavailable"
	}
	return hex.EncodeToString(b)
}

// recorder remembers the status and counts the bytes a handler wrote.
type recorder struct {
	http.ResponseWriter
	status      int
	bytes       int64
	wroteHeader bool
}

func (r *recorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(b []byte) (int, error) {
	r.wroteHeader = true
	n, err := r.ResponseWriter.Write(b)
	r.bytes += int64(n)
	return n, err
}
