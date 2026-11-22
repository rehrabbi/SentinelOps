package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"sentinelops/internal/audit"
	"sentinelops/internal/invite"
)

// runInvite implements the "invite" subcommand: it issues an invite from the
// command line, with database access instead of an admin session. It is how
// the first admin of a fresh database gets an account, now that there is no
// open sign-up, and it is audited as issued by "command-line".
//
//	api invite --email you@example.com --role admin [--site https://sentinelops.pages.dev]
//
// The printed link contains a one-time credential: hand it only to the person
// it is for, and never paste it anywhere shared.
func runInvite(ctx context.Context, db *sql.DB, args []string, out io.Writer) error {
	flags := flag.NewFlagSet("invite", flag.ContinueOnError)
	flags.SetOutput(out)
	email := flags.String("email", "", "address the account is for (required)")
	role := flags.String("role", "reporter", "reporter, analyst or admin")
	site := flags.String("site", os.Getenv("FRONTEND_ORIGIN"), "the site's address, to print the whole link")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *email == "" {
		return errors.New("--email is required")
	}

	token, inv, err := invite.Issue(ctx, db, audit.NewRepository(db), *email, *role, nil, nil)
	if err != nil {
		return err
	}

	fmt.Fprintf(out, "Invite for %s as %s, valid until %s UTC. Open this link to accept it:\n",
		inv.Email, inv.Role, inv.ExpiresAt.UTC().Format("2006-01-02 15:04"))
	base := strings.TrimRight(*site, "/")
	if base == "" {
		base = "<site>"
	}
	fmt.Fprintf(out, "%s/invite#%s\n", base, token)
	return nil
}
