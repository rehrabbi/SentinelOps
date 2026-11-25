import { useId, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { variants } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import './Privacy.css'

const REPO = 'https://github.com/rehrabbi/SentinelOps'
const UPDATED = '2026-11-25'

// Every statement on this page is something the running deployment does, checked against the
// code: backend/internal/{user,session,auth,invite,account,audit,prune,reqlog,incident},
// backend/migrations, backend/server.go, frontend/functions/api, frontend/src/theme/theme.ts,
// .github/workflows/{backup,audit-verify}.yml, infra/b2-upload.py and docs/RUNBOOK.md.
// Change a sentence only after checking the code still backs it. Durations and identifiers go in
// <Mono>, so they read as data.

/** A duration, a name or an identifier: data, so it is set in the mono face. */
function Mono({ children }: { children: ReactNode }) {
  return <span className="privacy-mono">{children}</span>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="privacy-section" aria-labelledby={id}>
      <h2 id={id} className="privacy-h2">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** What SentinelOps stores about the people who use it, where it lives, and what they can ask for. */
export function Privacy() {
  const reduced = useReducedMotion()

  return (
    <motion.article
      className="privacy"
      initial="initial"
      animate="show"
      variants={variants('fadeUp', reduced)}
    >
      <header className="privacy-head">
        <h1 className="privacy-h1">Privacy</h1>
        <p className="privacy-lede">
          What SentinelOps keeps about the people who use it, where that lives, and what you can
          ask for. It is run by one person, so this page says what the software and its hosting do,
          and nothing more.
        </p>
        <p className="privacy-updated">
          Last updated{' '}
          <time dateTime={UPDATED}>
            <Mono>{UPDATED}</Mono>
          </time>
        </p>
      </header>

      <Section title="The short version">
        <ul className="privacy-list">
          <li>
            It keeps an account (email address, name, a hash of your password), the incidents you
            file, and an audit log of security-relevant actions that includes your IP address.
          </li>
          <li>
            It sets one cookie, for your session, and remembers your light or dark choice on your
            device.
          </li>
          <li>It has no analytics, no advertising and no trackers, and it sends no email.</li>
          <li>
            The data sits with five providers, named below. Backups keep a copy for about{' '}
            <Mono>90 days</Mono>, and the audit log cannot be edited or erased, so a request to
            delete has limits (see “Your choices”).
          </li>
        </ul>
      </Section>

      <Section title="Your account">
        <p>
          An account holds your email address, your name, your role (reporter, analyst or admin),
          when it was created and last changed, and a bcrypt hash of your password. The password
          itself is never stored.
        </p>
        <p>
          Accounts exist only by invitation. Administrators can see every account’s email address,
          name and role on the Users page.
        </p>
      </Section>

      <Section title="Incidents">
        <p>
          An incident holds a title, a description, a status, a severity, the account that filed
          it, and when it was created and last changed. Titles and descriptions are stored exactly
          as typed, so keep passwords and personal details out of them.
        </p>
        <p>
          Reporters see only their own incidents. Analysts and administrators see all of them. The
          app has no way to delete an incident.
        </p>
      </Section>

      <Section title="Sessions">
        <p>
          When you sign in, the server makes a random token and gives it to your browser in a
          cookie. It stores only a SHA-256 hash of the token, with your account, the time it was
          made and the time it ends. A session lasts <Mono>7 days</Mono>. It does not record your IP
          address or your browser.
        </p>
        <p>
          Signing out, and “Log out everywhere”, delete the stored sessions straight away. An
          expired session is refused and is then deleted by a cleanup that runs when someone signs
          in, at most once an hour.
        </p>
      </Section>

      <Section title="Invite and reset links">
        <p>
          SentinelOps does not send email. An administrator gives you an invite or a password-reset
          link directly. The server keeps only a SHA-256 hash of the token in it. An invite also holds the
          email address and role it was issued for, and a reset holds the account it is for. Both
          record who issued them, and when they were made, used and expire.
        </p>
        <p>
          An invite works once, within <Mono>24 hours</Mono>. A reset link works once, within{' '}
          <Mono>1 hour</Mono>. A week after a link is used or has expired, the same cleanup deletes
          its row. The token sits after the <Mono>#</Mono> in the link, which browsers do not send
          in the request address.
        </p>
      </Section>

      <Section title="The audit log">
        <p>
          Security-relevant actions are written to an audit log: sign-ins and failed sign-ins,
          sign-outs, invites issued and accepted, role changes, password changes, “Log out
          everywhere”, and password resets issued and used. Creating or changing an incident is not
          in it.
        </p>
        <p>
          Each entry holds the time, the account that acted and a copy of its email address, the
          action, what it was done to, whether it succeeded, a few details of the action (for
          example the old and new role), and the IP address the request came from. A failed sign-in
          with an email address that has no account stores the address that was typed. An entry
          also keeps the email address of the person an invite, role change or password reset was
          for, even if they never created an account.
        </p>
        <p>
          Entries are kept. Each is chained by hash to the one before it, and the database refuses
          to change or delete them. Every <Mono>6 hours</Mono> a scheduled check verifies the chain
          and, when there are new entries, records the newest entry’s number and hash, with no
          personal data, on a branch of the public GitHub repository. The point of the log is that it cannot be rewritten, which also
          means entries cannot be erased on request, and the copy of your email address in an entry
          stays as it was if your address changes later.
        </p>
      </Section>

      <Section title="Request logs">
        <p>
          The API host writes one log line for every request. A line holds a random request ID, the
          method, the path without its query string, the status code, how long it took, how many
          bytes were sent, the visitor’s IP address (for IPv6, the network part only), and your
          account’s internal ID when you are signed in. It does not hold your email address.
        </p>
        <p>
          Lines never include cookies, request headers, query strings, or request and response
          bodies, so passwords and tokens do not appear in them. Render sets how long it keeps
          logs. SentinelOps does not.
        </p>
        <p>
          Calls to the API pass through a small function on Cloudflare Pages. It adds the
          visitor’s address, as Cloudflare reports it, so the API can log it and apply its rate
          limits.
        </p>
      </Section>

      <Section title="Backups">
        <p>
          Every night, at <Mono>02:47 UTC</Mono>, the whole database is dumped and encrypted with
          age before it is stored. Two copies are kept for about <Mono>90 days</Mono>: a GitHub
          Actions artifact and a file in a private Backblaze bucket, which deletes its copy a day
          after the lock ends. Only the operator holds the key.
        </p>
        <p>
          The GitHub repository is public, so any signed-in GitHub user can download the encrypted
          GitHub copies, but they cannot be read without the key. A backup holds everything the
          database held that night, so anything removed from the live database stays in older
          backups until they expire. Separately, the database provider keeps a rolling{' '}
          <Mono>6 hour</Mono> history of the live database, for restoring it to an earlier moment.
        </p>
      </Section>

      <Section title="Cookies and browser storage">
        <dl className="privacy-defs">
          <div>
            <dt>
              <Mono>sentinelops_session</Mono>
            </dt>
            <dd>
              A cookie holding your session token. It is <Mono>HttpOnly</Mono>, so page scripts
              cannot read it, <Mono>Secure</Mono>, so it travels only over HTTPS, and{' '}
              <Mono>SameSite=Lax</Mono>. It lasts <Mono>7 days</Mono> and is removed when you sign
              out. SentinelOps sets no cookie until you sign in.
            </dd>
          </div>
          <div>
            <dt>
              <Mono>sentinelops.theme</Mono>
            </dt>
            <dd>
              An entry in your browser’s local storage holding <Mono>system</Mono>,{' '}
              <Mono>dark</Mono> or <Mono>light</Mono>, set when you use the theme toggle. It stays
              on your device until you clear site data, and it is not sent to any server.
            </dd>
          </div>
        </dl>
        <p>The app uses no other cookies and no other browser storage.</p>
      </Section>

      <Section title="Where it is hosted">
        <dl className="privacy-defs">
          <div>
            <dt>Cloudflare</dt>
            <dd>Serves the site, and forwards calls to the API.</dd>
          </div>
          <div>
            <dt>Render</dt>
            <dd>Runs the API, and keeps its request logs.</dd>
          </div>
          <div>
            <dt>Neon</dt>
            <dd>Hosts the PostgreSQL database that holds everything above except the logs.</dd>
          </div>
          <div>
            <dt>GitHub</dt>
            <dd>
              Holds the source code, runs the scheduled checks and nightly backups, and stores one
              encrypted backup copy.
            </dd>
          </div>
          <div>
            <dt>Backblaze</dt>
            <dd>Stores the second encrypted backup copy.</dd>
          </div>
        </dl>
        <p>
          That is all this page says about them. What each provider does with data on its own
          systems is set by that provider.
        </p>
      </Section>

      <Section title="No analytics, no trackers">
        <p>
          The site loads no analytics, advertising or tracking scripts, and no scripts, fonts or
          images from anywhere else. Everything comes from the site’s own address, and the
          site’s security headers stop the browser loading anything that does not.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          The app has no self-service way to see, correct or delete your data. Administrators can
          see each account’s email, name and role, but in the app they can only change roles and
          issue invites and resets, not correct or delete anything. The
          operator can look up or correct an account’s details directly in the database. Deleting
          an account is not currently supported. To ask, open an issue in the{' '}
          <a href={`${REPO}/issues`}>GitHub repository</a>. Issues there are public, so do not put
          your email address or anything about your account in it; ask for a private way to get in
          touch.
        </p>
        <p>
          Whatever is decided about an account, audit log entries stay, because the database will not
          change them, and backups stay until they expire after about <Mono>90 days</Mono>.
        </p>
        <p>
          You can sign out at any time, and “Log out everywhere” on the Account page ends every
          session you have. Clearing this site’s data in your browser removes the cookie and the
          theme choice from your device.
        </p>
      </Section>
    </motion.article>
  )
}
