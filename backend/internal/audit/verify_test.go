package audit

import (
	"strings"
	"testing"
)

// ParseAnchor guards the scheduled verification: if it accepted a malformed
// anchor, the check against the recorded head would silently test nothing.
func TestParseAnchor(t *testing.T) {
	hash := strings.Repeat("ab", 32) // 64 lowercase hex characters

	valid := []struct {
		in   string
		want Anchor
	}{
		{"4:" + hash, Anchor{ID: 4, Hash: hash}},
		{"  12:" + hash + "\n", Anchor{ID: 12, Hash: hash}}, // read from a file line
	}
	for _, tc := range valid {
		got, err := ParseAnchor(tc.in)
		if err != nil {
			t.Errorf("ParseAnchor(%q): unexpected error %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("ParseAnchor(%q) = %+v, want %+v", tc.in, got, tc.want)
		}
		// What verify-audit prints must parse back to the same anchor.
		if round, err := ParseAnchor(got.String()); err != nil || round != got {
			t.Errorf("round trip of %+v gave %+v, %v", got, round, err)
		}
	}

	invalid := []string{
		"",                                   // nothing
		hash,                                 // no id
		"4",                                  // no hash
		"0:" + hash,                          // ids start at 1
		"-1:" + hash,                         // negative id
		"x:" + hash,                          // id not a number
		"4:" + strings.ToUpper(hash),         // uppercase hex
		"4:" + hash[:63],                     // too short
		"4:" + hash + "00",                   // too long
		"4:" + strings.Repeat("zz", 32),      // not hex
		"4:" + hash[:32] + ":" + hash[32:62], // extra colon
	}
	for _, in := range invalid {
		if got, err := ParseAnchor(in); err == nil {
			t.Errorf("ParseAnchor(%q) = %+v, want an error", in, got)
		}
	}
}
