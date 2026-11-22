import { Link } from "react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  createInvite,
  getUsers,
  updateUserRole,
  ApiError,
  type IssuedInvite,
  type Role,
  type User,
} from "./api";

// The load state for the user list — exactly one of these three, the same
// discriminated-union shape the incident dashboard uses.
type ListState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; users: User[] };

const ROLES: Role[] = ["reporter", "analyst", "admin"];

// AdminPage lists every account and lets an admin change someone else's role.
// Reaching this screen already requires the admin role, but that is routing
// convenience: the API is the actual control, and it answers 403 to anyone else.
export function AdminPage({ currentUserId }: { currentUserId: string }) {
  const [list, setList] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    getUsers()
      .then((users) => setList({ kind: "ready", users }))
      .catch((err) => {
        const message =
          err instanceof ApiError ? err.message : "Failed to load users";
        setList({ kind: "error", message });
      });
  }, []);

  // Replace one user in place after a role change, so we never refetch.
  function handleUpdated(updated: User) {
    setList((prev) =>
      prev.kind === "ready"
        ? {
            kind: "ready",
            users: prev.users.map((u) => (u.id === updated.id ? updated : u)),
          }
        : prev
    );
  }

  if (list.kind === "loading") {
    return <p className="status loading">Loading users…</p>;
  }
  if (list.kind === "error") {
    return <p className="status error">{list.message}</p>;
  }

  return (
    <section className="admin">
      <h2>User roles</h2>
            <p className="admin-link">
        <Link to="/">Back to incidents</Link>
      </p>
      <InviteForm />
      <ul className="user-list">
        {list.users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isSelf={u.id === currentUserId}
            onUpdated={handleUpdated}
          />
        ))}
      </ul>
    </section>
  );
}

// One row. The select holds a draft choice; Save commits it. Granting admin is
// privileged enough to deserve a deliberate second action rather than firing on
// change like the incident status dropdown does.
function UserRow({
  user,
  isSelf,
  onUpdated,
}: {
  user: User;
  isSelf: boolean;
  onUpdated: (user: User) => void;
}) {
  const [choice, setChoice] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to save until the draft differs from what the server told us.
  const dirty = choice !== user.role;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUserRole(user.id, choice);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
      // Snap the control back to the truth we know, so the screen never shows
      // a role the server refused.
      setChoice(user.role);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="user-row">
      <div className="user-main">
        <span className="user-name">
          {user.fullName}
          {isSelf && <span className="user-self"> (you)</span>}
        </span>
        <span className="user-email">{user.email}</span>
        {error && <span className="status error">{error}</span>}
      </div>
      <div className="user-controls">
        <span className={`badge role-${user.role}`}>{user.role}</span>
        <select
          value={choice}
          disabled={isSelf || saving}
          onChange={(e) => setChoice(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button onClick={save} disabled={isSelf || !dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </li>
  );
}
// InviteForm issues a one-time invite and shows its link, once. Accounts exist
// only through invites: there is no open sign-up, so nobody can learn which
// emails have accounts by trying to register them.
function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("reporter");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; message: string }
    | { kind: "issued"; invite: IssuedInvite; copied: boolean }
  >({ kind: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const invite = await createInvite(email, role);
      setStatus({ kind: "issued", invite, copied: false });
      setEmail("");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not create the invite";
      setStatus({ kind: "error", message });
    }
  }

  // The token goes after "#": browsers never send that part to any server, so
  // the credential stays out of request logs and Referer headers.
  const link =
    status.kind === "issued"
      ? `${window.location.origin}/invite#${status.invite.token}`
      : "";

  async function copyLink() {
    if (status.kind !== "issued") return;
    try {
      await navigator.clipboard.writeText(link);
      setStatus({ ...status, copied: true });
    } catch {
      // Clipboard access can be refused; the link stays visible to copy by hand.
    }
  }

  return (
    <form className="incident-form invite-form" onSubmit={handleSubmit}>
      <h3>Invite someone</h3>
      <div className="invite-fields">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={status.kind === "submitting"}>
          {status.kind === "submitting" ? "Creating…" : "Create invite"}
        </button>
      </div>
      {status.kind === "error" && (
        <p className="status error">{status.message}</p>
      )}
      {status.kind === "issued" && (
        <div className="invite-issued">
          <p>
            Invite for <strong>{status.invite.email}</strong> as{" "}
            {status.invite.role}, valid until{" "}
            {new Date(status.invite.expiresAt).toLocaleString()}. Send this link
            only to them; it is shown once and works once.
          </p>
          <div className="invite-link">
            <input type="text" readOnly value={link} aria-label="Invite link" />
            <button type="button" onClick={copyLink}>
              {status.copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
