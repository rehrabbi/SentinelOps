package user

import (
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"unicode/utf8"
)

// Validation bounds. Our policy favours LENGTH over forced composition rules
// (NIST 800-63B): require a decent minimum length, otherwise let people choose
// passphrases. No "must contain a symbol" nonsense.
const (
	minPasswordLen = 12 // measured in characters (runes)
	maxPasswordLen = 72 // measured in bytes - bcrypt ignores anything past 72
	// bytes, so we REJECT longer input instead of silently
	// truncating (which would weaken the password unseen).
	maxEmailLen    = 254
	maxFullNameLen = 100
)

// CreateInput is theraw, untrusted request body for creating a user. The json
// tags map to exactly the fields a client is allowed to send.
type CreateInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"fullName"`
}

// ErrValidation is the sentinel wrapped by every validation failure. The
// handler uses errors. is to recognize it and respond 400. Messages describe the
// broken RULE - they never echo the attacker's raw input back.
var ErrValidation = errors.New("validation failed")

// Normalize cleans up the input before validation and storage.
func (in *CreateInput) Normalize() {
	// Store/compare emails in lower case - our UNIQUE index is on lower(email).
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.FullName = strings.TrimSpace(in.FullName)
	// We deliberately do NOT trim the password: leading/trailing spaces are
	// legitimate characters, and silently trimming would change what was typed.
}

// Validate enforces our input rules, returning a wrapped ErrValidation with a
// short, safe reason on the first failure.
func (in CreateInput) Validate() error {
	// Email: present, bounded, and a real bare address
	if in.Email == "" {
		return fmt.Errorf("%w: email is required", ErrValidation)
	}
	if len(in.Email) > maxEmailLen {
		return fmt.Errorf("%w: email is too long", ErrValidation)
	}
	// mail.ParseAddress also accepts display-name forms like "AI <a@b.com";
	// insist the parsed address equals the input so we only accept bare emails.
	if addr, err := mail.ParseAddress(in.Email); err != nil || addr.Address != in.Email {
		return fmt.Errorf("%w: email is not a valid address", ErrValidation)
	}

	// Password: length-based policy
	// Minimum counts runes (so multi-byte characters aren't unfairly "worth
	// more"); maximum counts bytes (bcrypt's hard 72-byte limit).
	if utf8.RuneCountInString(in.Password) < minPasswordLen {
		return fmt.Errorf("%w: password must be at least %d characters", ErrValidation,
			minPasswordLen)
	}
	if len(in.Password) > maxPasswordLen {
		return fmt.Errorf("%w: password must be at most %d bytes", ErrValidation,
			maxPasswordLen)
	}

	// Full name: present and bounded
	if in.FullName == "" {
		return fmt.Errorf("%w: full name is required", ErrValidation)
	}
	if utf8.RuneCountInString(in.FullName) > maxFullNameLen {
		return fmt.Errorf("%w: full name is too long", ErrValidation)
	}

	return nil
}
