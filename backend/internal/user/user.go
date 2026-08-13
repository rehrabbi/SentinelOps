// Package user contains everything for the "user" domain: the model, the
// database access (repository), and the HTTP handlers. Grouping by feature
// keeps related code together as the app grows.
package user

import "time"

// User represents a row in the users table.
//
// The struct tags control JSON output. Note `json:"-"` on PasswordHash: it
// tells the JSON encoder to NEVER include the hash in a response. Even if we
// accidentally hand a fully-populated User to json.Encode, the secret can't
// leak to a client. Defense-in-depth.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	FullName     string    `json:"fullName"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
