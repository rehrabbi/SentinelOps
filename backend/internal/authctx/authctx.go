// Package authctx carries the authenticated caller through a request context.
//
// It deliberately imports nothing from the domain packages. The auth middleware
// puts a Principal in; handlers in user, incident, and anywhere else take it out.
// If this package held a user.User instead, then user would import authctx while
// authctx imported user, which is an import cycle Go refuses to compile.
//
// Carrying a Principal rather than a database row is also the more honest shape.
// A context answers "who is asking", not "here is a cached copy of a table row".
package authctx

import "context"

// contextKey is a private type for the keys this package sets. An unexported
// named type makes collisions impossible, because no other package can name it.
// go vet flags bare-string context keys for exactly this reason.
type contextKey int

// principalKey identifies the authenticated caller stored in the request context.
const principalKey contextKey = 0

// Principal is the authenticated caller: who they are and what they may do.
// Role is loaded fresh from the database on every request by the middleware, so
// it cannot be forged by a client and a role change takes effect immediately.
//
// Email is here because an audit entry must name the actor in human-readable
// form, and re-reading the user row on every privileged action to recover it
// would be a query to retrieve something we already had.
type Principal struct {
	ID    string
	Email string
	Role  string
}

// WithPrincipal returns a copy of ctx carrying p. Only the auth middleware
// should call this.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

// FromContext returns the authenticated caller. The bool is false when there is
// none, meaning the handler was not placed behind RequireAuth. Callers must
// check it and fail closed rather than assuming a caller is present.
func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey).(Principal)
	return p, ok
}
