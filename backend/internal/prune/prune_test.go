package prune

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// testPruner counts cleanups instead of touching a database.
func testPruner(every time.Duration) (*Pruner, *atomic.Int64, *time.Time) {
	var runs atomic.Int64
	clock := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	p := &Pruner{
		every: every,
		now:   func() time.Time { return clock },
		run: func(context.Context) error {
			runs.Add(1)
			return nil
		},
	}
	return p, &runs, &clock
}

func TestRunsAtMostOncePerInterval(t *testing.T) {
	p, runs, clock := testPruner(time.Hour)

	p.MaybeRun() // the first call after a start always runs
	p.MaybeRun()
	*clock = clock.Add(59 * time.Minute)
	p.MaybeRun()
	if n := runs.Load(); n != 1 {
		t.Fatalf("%d runs within the hour, want 1", n)
	}

	*clock = clock.Add(time.Minute)
	p.MaybeRun()
	if n := runs.Load(); n != 2 {
		t.Errorf("%d runs after the hour passed, want 2", n)
	}
}

func TestConcurrentLoginsRunItOnce(t *testing.T) {
	p, runs, _ := testPruner(time.Hour)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.MaybeRun()
		}()
	}
	wg.Wait()
	if n := runs.Load(); n != 1 {
		t.Errorf("%d runs from 50 simultaneous logins, want 1", n)
	}
}

func TestFailureDoesNotBreakTheRequest(t *testing.T) {
	p, _, _ := testPruner(time.Hour)
	p.run = func(context.Context) error { return errors.New("database unavailable") }
	h := p.AfterLogin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("logged in"))
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/sessions", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "logged in" {
		t.Errorf("login answered %d %q despite a failed cleanup", rec.Code, rec.Body.String())
	}
}

func TestOnlySuccessfulLoginsTrigger(t *testing.T) {
	p, runs, _ := testPruner(time.Hour)
	status := http.StatusUnauthorized
	h := p.AfterLogin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	}))
	call := func() { h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/sessions", nil)) }

	call()
	status = http.StatusTooManyRequests
	call()
	if n := runs.Load(); n != 0 {
		t.Fatalf("failed logins triggered %d cleanups", n)
	}
	status = http.StatusOK
	call()
	if n := runs.Load(); n != 1 {
		t.Errorf("a successful login triggered %d cleanups, want 1", n)
	}
}
