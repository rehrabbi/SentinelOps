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

	"sentinelops/internal/account"
	"sentinelops/internal/audit"
	"sentinelops/internal/invite"
	"sentinelops/internal/user"
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

// runResetPassword implements the "reset-password" subcommand: it issues a
// one-time password reset link from the command line, with database access
// instead of an admin session. It is the way back in when the only admin has
// forgotten their password, which no one in the app could otherwise fix, and
// it is audited as issued by "command-line".
//
//	api reset-password --email you@example.com [--site https://sentinelops.pages.dev]
//
// Like a reset an admin issues, the link works once, for an hour, replaces any
// earlier link for that account, and ends every session of the account when
// used. It is a credential: hand it only to the account's owner.
func runResetPassword(ctx context.Context, db *sql.DB, args []string, out io.Writer) error {
	flags := flag.NewFlagSet("reset-password", flag.ContinueOnError)
	flags.SetOutput(out)
	email := flags.String("email", "", "the account's address (required)")
	site := flags.String("site", os.Getenv("FRONTEND_ORIGIN"), "the site's address, to print the whole link")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *email == "" {
		return errors.New("--email is required")
	}

	users := user.NewRepository(db)
	u, err := users.GetByEmail(ctx, user.NormalizeEmail(*email))
	if err != nil {
		return err
	}
	token, rs, err := account.NewService(db, users, audit.NewRepository(db)).IssueReset(ctx, nil, u.ID, nil)
	if err != nil {
		return err
	}

	fmt.Fprintf(out, "Password reset for %s, valid until %s UTC. Open this link to choose a new password:\n",
		rs.Email, rs.ExpiresAt.UTC().Format("2006-01-02 15:04"))
	base := strings.TrimRight(*site, "/")
	if base == "" {
		base = "<site>"
	}
	fmt.Fprintf(out, "%s/reset#%s\n", base, token)
	return nil
}
