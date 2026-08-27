// Package incident contains the incident/ticket domain: the model, the database
// access (repository), and the HTTP handlers. Grouped by feature, like user and
// session.
package incident

import "time"

// Incident represents a row in the incidents table. UserID is the owner (the
// creator) — the column authorization is built around. Status and severity are
// constrained to fixed sets by CHECK constraints in the database.

type Incident struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	Severity    string    `json:"severity"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
