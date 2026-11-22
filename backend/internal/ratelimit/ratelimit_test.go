package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeClock lets tests move time instead of waiting for it.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newTestLimiter(limit int, window time.Duration) (*Limiter, *fakeClock) {
	clock := &fakeClock{t: time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)}
	l := New(limit, window)
	l.now = clock.now
	return l, clock
}

// attempt reserves a slot for key and settles it with count; it reports
// whether the slot was granted.
func attempt(l *Limiter, key string, count bool) (bool, time.Duration) {
	ok, retry, done := l.Reserve(key)
	if ok {
		done(count)
	}
	return ok, retry
}

func TestLimitAndSlidingWindow(t *testing.T) {
	l, clock := newTestLimiter(3, 10*time.Minute)

	for i := 0; i < 3; i++ {
		if ok, _ := attempt(l, "a", true); !ok {
			t.Fatalf("attempt %d refused under the limit", i+1)
		}
		clock.advance(time.Minute)
	}
	ok, retry := attempt(l, "a", true)
	if ok {
		t.Fatal("fourth counted attempt allowed")
	}
	// The first event was at 12:00, it is now 12:03, so it leaves at 12:10.
	if retry != 7*time.Minute {
		t.Errorf("retryAfter = %v, want 7m", retry)
	}

	if ok, _ := attempt(l, "b", true); !ok {
		t.Error("another key was affected")
	}

	clock.advance(7 * time.Minute) // the 12:00 event leaves the window
	if ok, _ := attempt(l, "a", true); !ok {
		t.Error("still refused after the oldest event left the window")
	}
	if ok, _ := attempt(l, "a", true); ok {
		t.Error("the window let two through after only one event left it")
	}
}

func TestUncountedAttemptsAreFree(t *testing.T) {
	l, _ := newTestLimiter(2, time.Hour)
	for i := 0; i < 50; i++ {
		if ok, _ := attempt(l, "a", false); !ok {
			t.Fatalf("uncounted attempt %d refused", i+1)
		}
	}
	attempt(l, "a", true)
	attempt(l, "a", true)
	if ok, _ := attempt(l, "a", false); ok {
		t.Error("allowed past the limit; a free attempt must not reset counted ones")
	}
}

// Many simultaneous requests must not slip past the limit before any of them
// is counted.
func TestConcurrentReservationsCannotExceedLimit(t *testing.T) {
	l, _ := newTestLimiter(10, time.Hour)
	var granted atomic.Int64
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			ok, _, done := l.Reserve("a")
			if !ok {
				return
			}
			granted.Add(1)
			time.Sleep(5 * time.Millisecond) // the slow password check
			done(true)
		}()
	}
	close(start)
	wg.Wait()
	if n := granted.Load(); n != 10 {
		t.Errorf("%d of 200 concurrent attempts granted, want exactly 10", n)
	}
}

func TestDoneIsIdempotent(t *testing.T) {
	l, _ := newTestLimiter(2, time.Hour)
	_, _, done := l.Reserve("a")
	done(true)
	done(true) // a second call must not count twice
	if ok, _ := attempt(l, "a", true); !ok {
		t.Error("a repeated done counted twice")
	}
}

func TestMemoryIsBounded(t *testing.T) {
	l, clock := newTestLimiter(5, time.Minute)
	l.maxKeys = 3
	for _, k := range []string{"a", "b", "c"} {
		attempt(l, k, true)
	}
	if ok, _ := attempt(l, "d", true); ok {
		t.Error("a new key was admitted beyond maxKeys; it must fail closed")
	}
	if ok, _ := attempt(l, "a", true); !ok {
		t.Error("a key already tracked was refused at maxKeys")
	}

	clock.advance(2 * time.Minute) // every event expires; the next call sweeps
	if ok, _ := attempt(l, "d", true); !ok {
		t.Error("expired keys were not swept")
	}
	if n := len(l.events); n != 1 {
		t.Errorf("%d keys tracked after the sweep, want 1", n)
	}
}

func TestKey(t *testing.T) {
	cases := map[string]string{
		"203.0.113.9":                      "203.0.113.9",
		"::ffff:203.0.113.9":               "203.0.113.9",
		"2001:db8:1:2:aaaa:bbbb:cccc:dddd": "2001:db8:1:2::/64",
		"2001:db8:1:2::1":                  "2001:db8:1:2::/64", // same /64, same key
		"2001:db8:1:3::1":                  "2001:db8:1:3::/64", // next /64, new key
		"not-an-ip":                        "unknown",
		"":                                 "unknown",
	}
	for in, want := range cases {
		if got := Key(in); got != want {
			t.Errorf("Key(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestWrap(t *testing.T) {
	l, _ := newTestLimiter(2, time.Hour)
	status := http.StatusUnauthorized
	h := l.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	}), func(*http.Request) string { return "visitor" }, func(s int) bool { return s == http.StatusUnauthorized })

	call := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/sessions", nil))
		return rec
	}

	status = http.StatusOK
	for i := 0; i < 5; i++ {
		if got := call().Code; got != http.StatusOK {
			t.Fatalf("success %d answered %d; successes must not count", i+1, got)
		}
	}
	status = http.StatusUnauthorized
	call()
	call()
	rec := call()
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") != "3600" {
		t.Errorf("third failure: %d, Retry-After %q; want 429 and 3600", rec.Code, rec.Header().Get("Retry-After"))
	}
	status = http.StatusOK
	if got := call().Code; got != http.StatusTooManyRequests {
		t.Errorf("a refused visitor reached the handler (%d); the check runs first", got)
	}
}
