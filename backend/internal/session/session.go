// Package session handles server-side login sessions: the data model and the
// storage of sessions used for cookie-based authentication.
package session

import "time"

// Session is one row in the sessions table.
//
// TokenHash is the SHA-256 hash of the random token we place in the user's
// cookie. We store ONLY the hash, never the raw token, so a leak of this table
// cannot be used to impersonate anyone. There are deliberately no JSON tags: a
// Session is server-side state and is never serialized to a client.
type Session struct {
	TokenHash string
	UserID    string
	CreatedAt time.Time
	ExpiresAt time.Time
}
