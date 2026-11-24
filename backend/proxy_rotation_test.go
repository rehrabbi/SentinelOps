package main

// Rotating PROXY_SECRET without refusing anyone: during a rotation the API
// accepts the previous secret as well, and marks the requests it let in.

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

func TestProxySecretsFromEnvironment(t *testing.T) {
	env := func(vars map[string]string) func(string) string {
		return func(k string) string { return vars[k] }
	}
	cases := []struct {
		name              string
		vars              map[string]string
		current, previous string
		wantErr           bool
	}{
		{"local development", nil, "", "", false},
		{"normal", map[string]string{"PROXY_SECRET": "a"}, "a", "", false},
		{"rotating", map[string]string{"PROXY_SECRET": "b", "PROXY_SECRET_PREVIOUS": "a"}, "b", "a", false},
		// Without a current secret the check is off, so a lone previous one
		// would look enforced while letting everyone in: refuse to start.
		{"previous alone", map[string]string{"PROXY_SECRET_PREVIOUS": "a"}, "", "", true},
	}
	for _, tc := range cases {
		current, previous, err := proxySecrets(env(tc.vars))
		if (err != nil) != tc.wantErr || current != tc.current || previous != tc.previous {
			t.Errorf("%s: got (%q, %q, %v), want (%q, %q, error %v)",
				tc.name, current, previous, err, tc.current, tc.previous, tc.wantErr)
		}
	}
}

func TestProxySecretRotation(t *testing.T) {
	const (
		oldSecret = "test-proxy-secret-old-local-only"
		newSecret = "test-proxy-secret-new-local-only"
	)
	// with returns a client that sends secret through the proxy header.
	with := func(c *client, secret string) *client {
		c.header.Set("X-Proxy-Secret", secret)
		return c
	}

	// Before: only the old secret works.
	before := newServer(t, serverConfig{ProxySecret: oldSecret})
	with(newClient(t, before), oldSecret).expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	with(newClient(t, before), newSecret).expect(http.StatusForbidden, "GET", "/api/me", nil)

	// During: the API holds both, so the proxy can switch at any moment.
	var logs bytes.Buffer
	during := newServer(t, serverConfig{
		ProxySecret:         newSecret,
		ProxySecretPrevious: oldSecret,
		Logger:              slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	with(newClient(t, during), newSecret).expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	with(newClient(t, during), oldSecret).expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	with(newClient(t, during), "wrong").expect(http.StatusForbidden, "GET", "/api/me", nil)
	newClient(t, during).expect(http.StatusForbidden, "GET", "/api/me", nil)
	newClient(t, during).expect(http.StatusOK, "GET", "/healthz", nil) // still exempt

	// Only the request the previous secret let in is marked, and no secret
	// ever reaches the log.
	var marks []string
	for _, raw := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
		var line map[string]any
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			t.Fatalf("log line %q: %v", raw, err)
		}
		if line["proxy_secret"] != nil {
			marks = append(marks, line["proxy_secret"].(string))
		}
	}
	if len(marks) != 1 || marks[0] != "previous" {
		t.Errorf("proxy_secret marks = %v, want exactly one \"previous\"", marks)
	}
	if strings.Contains(logs.String(), oldSecret) || strings.Contains(logs.String(), newSecret) {
		t.Error("a proxy secret reached the request log")
	}

	// After: the previous secret is removed and stops working.
	after := newServer(t, serverConfig{ProxySecret: newSecret})
	with(newClient(t, after), newSecret).expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	with(newClient(t, after), oldSecret).expect(http.StatusForbidden, "GET", "/api/me", nil)
}
