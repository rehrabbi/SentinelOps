package reqlog

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// serve runs one request through the middleware and returns the response and
// the single decoded log line.
func serve(t *testing.T, h http.Handler, req *http.Request) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	rec := httptest.NewRecorder()
	Middleware(logger, func(*http.Request) string { return "203.0.113.7" }, h).ServeHTTP(rec, req)

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("%d log lines, want exactly 1: %q", len(lines), buf.String())
	}
	var line map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &line); err != nil {
		t.Fatalf("log line is not JSON: %v: %q", err, lines[0])
	}
	return rec, line
}

func TestOneLinePerRequest(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte("hello"))
	})
	req := httptest.NewRequest("POST", "/api/incidents?token=never-logged", nil)
	req.Header.Set("X-Request-ID", "forged-by-client")
	rec, line := serve(t, h, req)

	id := rec.Header().Get("X-Request-ID")
	if len(id) != 16 || id == "forged-by-client" || line["request_id"] != id {
		t.Errorf("request id: header %q, logged %v; want a fresh 16-character id in both", id, line["request_id"])
	}
	want := map[string]any{"msg": "request", "level": "INFO", "method": "POST", "path": "/api/incidents",
		"status": float64(201), "bytes": float64(5), "visitor": "203.0.113.7"}
	for k, v := range want {
		if line[k] != v {
			t.Errorf("%s = %v, want %v", k, line[k], v)
		}
	}
	if _, ok := line["duration_ms"].(float64); !ok {
		t.Errorf("duration_ms missing: %v", line)
	}
	if _, ok := line["user_id"]; ok {
		t.Error("user_id logged for an anonymous request")
	}
}

func TestLevelsFollowStatus(t *testing.T) {
	for status, level := range map[int]string{200: "INFO", 302: "INFO", 404: "WARN", 429: "WARN", 500: "ERROR"} {
		h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) })
		_, line := serve(t, h, httptest.NewRequest("GET", "/x", nil))
		if line["level"] != level {
			t.Errorf("status %d logged at %v, want %s", status, line["level"], level)
		}
	}
}

func TestSlotsFilledByInnerLayers(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SetVisitor(r.Context(), "198.51.100.9")
		SetUser(r.Context(), "5f0c6a1e-0000-4000-8000-000000000001")
	})
	_, line := serve(t, h, httptest.NewRequest("GET", "/api/me", nil))
	if line["visitor"] != "198.51.100.9" || line["user_id"] != "5f0c6a1e-0000-4000-8000-000000000001" {
		t.Errorf("visitor %v, user_id %v; want the values set inside", line["visitor"], line["user_id"])
	}
}

func TestPreviousSecretIsMarkedOnlyWhenUsed(t *testing.T) {
	marked := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { MarkPreviousSecret(r.Context()) })
	if _, line := serve(t, marked, httptest.NewRequest("GET", "/api/me", nil)); line["proxy_secret"] != "previous" {
		t.Errorf("proxy_secret = %v, want previous", line["proxy_secret"])
	}
	plain := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	if _, line := serve(t, plain, httptest.NewRequest("GET", "/api/me", nil)); line["proxy_secret"] != nil {
		t.Errorf("an ordinary request carries proxy_secret = %v", line["proxy_secret"])
	}
}

func TestLongPathIsCapped(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	_, line := serve(t, h, httptest.NewRequest("GET", "/"+strings.Repeat("a", 5000), nil))
	if p, _ := line["path"].(string); len(p) > maxPathLen+len("…") {
		t.Errorf("logged path is %d bytes, want at most %d", len(p), maxPathLen+len("…"))
	}
}

func TestSettersAreSafeOutsideTheMiddleware(t *testing.T) {
	// RequireAuth calls SetUser on every request; without the middleware (in a
	// unit test, say) that must be a harmless no-op.
	SetUser(httptest.NewRequest("GET", "/", nil).Context(), "x")
	SetVisitor(httptest.NewRequest("GET", "/", nil).Context(), "x")
	MarkPreviousSecret(httptest.NewRequest("GET", "/", nil).Context())
}
