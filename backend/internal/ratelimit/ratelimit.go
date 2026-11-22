// Package ratelimit limits how often one visitor may do something, such as
// fail a login, within a sliding time window.
//
// Counts live in memory. Production runs a single API instance, so one
// process sees every request, and an attacker who keeps guessing also keeps
// that instance awake, so the counts hold exactly while they matter. A restart
// clears them; that is the accepted trade-off for needing no database writes.
package ratelimit

import (
	"log"
	"math"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// defaultMaxKeys bounds memory. At roughly a hundred bytes per tracked event
// it stays in the low tens of megabytes even when every key is full.
const defaultMaxKeys = 100_000

// Limiter allows at most limit counted events per key in any window.
type Limiter struct {
	limit   int
	window  time.Duration
	maxKeys int
	now     func() time.Time

	mu        sync.Mutex
	events    map[string][]time.Time // counted events per key, oldest first
	pending   map[string]int         // reserved slots whose outcome is not known yet
	lastSweep time.Time
}

// New returns a limiter allowing limit counted events per key per window.
func New(limit int, window time.Duration) *Limiter {
	return &Limiter{
		limit:   limit,
		window:  window,
		maxKeys: defaultMaxKeys,
		now:     time.Now,
		events:  map[string][]time.Time{},
		pending: map[string]int{},
	}
}

// Reserve claims a slot for key. If none is free it returns ok=false and how
// long until the oldest counted event leaves the window. Otherwise the caller
// must call done exactly once, with whether the attempt counts.
//
// Reserving before the attempt, rather than checking and counting afterwards,
// is what makes the limit hold under concurrency: without it, many requests
// sent at once would all pass the check before any of them was counted.
func (l *Limiter) Reserve(key string) (ok bool, retryAfter time.Duration, done func(count bool)) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweep(now)
	recent := l.prune(key, now)

	// A key the limiter cannot track is refused rather than let through
	// unlimited: under a flood of distinct addresses this fails closed.
	if _, tracked := l.events[key]; !tracked && l.pending[key] == 0 && len(l.events)+len(l.pending) >= l.maxKeys {
		log.Printf("rate limit: tracking %d keys, refusing new key %s", l.maxKeys, key)
		return false, l.window, nil
	}

	if len(recent)+l.pending[key] >= l.limit {
		if len(recent) == 0 {
			// Only in-flight reservations fill the slots; they settle quickly.
			return false, time.Second, nil
		}
		return false, recent[0].Add(l.window).Sub(now), nil
	}

	l.pending[key]++
	var once sync.Once
	return true, 0, func(count bool) {
		once.Do(func() { l.settle(key, count) })
	}
}

func (l *Limiter) settle(key string, count bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.pending[key]--; l.pending[key] <= 0 {
		delete(l.pending, key)
	}
	if count {
		l.events[key] = append(l.events[key], l.now())
	}
}

// prune drops key's events that have left the window and returns the rest.
// Callers hold l.mu.
func (l *Limiter) prune(key string, now time.Time) []time.Time {
	ts, ok := l.events[key]
	if !ok {
		return nil
	}
	cutoff := now.Add(-l.window)
	i := 0
	for i < len(ts) && !ts[i].After(cutoff) {
		i++
	}
	if i == len(ts) {
		delete(l.events, key)
		return nil
	}
	ts = ts[i:]
	l.events[key] = ts
	return ts
}

// sweep forgets keys with no recent events, at most once per window, so
// memory follows recent activity rather than every visitor ever seen.
// Callers hold l.mu.
func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < l.window {
		return
	}
	l.lastSweep = now
	for key := range l.events {
		l.prune(key, now)
	}
}

// Key turns a client address into a limiter key. IPv6 addresses are grouped
// by their /64, because one connection is usually given a whole /64 and could
// otherwise rotate through addresses to dodge a per-address limit. Anything
// unparseable shares a single key.
func Key(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return "unknown"
	}
	if v4 := parsed.To4(); v4 != nil {
		return v4.String()
	}
	return (&net.IPNet{IP: parsed.Mask(net.CIDRMask(64, 128)), Mask: net.CIDRMask(64, 128)}).String()
}

// Wrap limits next. Each request reserves a slot for key(r); when none is
// free it is refused with 429 and Retry-After before next runs at all. After
// next responds, the attempt counts only if counts(status) is true, so for
// example a correct password never uses up the limit.
func (l *Limiter) Wrap(next http.Handler, key func(*http.Request) string, counts func(status int) bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		k := key(r)
		ok, retryAfter, done := l.Reserve(k)
		if !ok {
			seconds := int(math.Ceil(retryAfter.Seconds()))
			if seconds < 1 {
				seconds = 1
			}
			w.Header().Set("Retry-After", strconv.Itoa(seconds))
			http.Error(w, "too many attempts, try again later", http.StatusTooManyRequests)
			log.Printf("rate limit: refused %s %s for %s, retry in %ds", r.Method, r.URL.Path, k, seconds)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		counted := false
		// Settle even if next panics, so a slot is never held forever.
		defer func() { done(counted) }()
		next.ServeHTTP(rec, r)
		counted = counts(rec.status)
	})
}

// statusRecorder remembers the status code a handler wrote.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
