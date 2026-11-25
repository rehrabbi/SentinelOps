import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { changePassword, logoutEverywhere, type User } from "../api";
import { errorMessage, type FormStatus } from "./formStatus";

// AccountPage is where people keep control of their own account: change the
// password, or end every session at once if a device was lost.
export function AccountPage({
  user,
  onLoggedOut,
}: {
  user: User;
  onLoggedOut: () => void;
}) {
  return (
    <>
      <p className="admin-link">
        <Link to="/">Back to incidents</Link>
      </p>
      <ChangePasswordForm email={user.email} />
      <LogoutEverywhere onLoggedOut={onLoggedOut} />
    </>
  );
}

function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // A typo in a password nobody can see would lock its owner out, so the
    // new one is typed twice. The server does not need the copy.
    if (next !== confirm) {
      setStatus({ kind: "error", message: "The new passwords do not match" });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ kind: "done" });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err, "Something went wrong") });
    }
  }

  return (
    <section className="auth-card">
      <h2>Change password</h2>
      <form onSubmit={handleSubmit}>
        {/* Lets a password manager tie the new password to this account. */}
        <input type="email" value={email} readOnly hidden autoComplete="username" />
        <label>
          Current password
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        {status.kind === "error" && <p className="status error">{status.message}</p>}
        {status.kind === "done" && (
          <p className="status success">
            Password changed. Every other session of yours was logged out.
          </p>
        )}
        <button type="submit" disabled={status.kind === "submitting"}>
          {status.kind === "submitting" ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function LogoutEverywhere({ onLoggedOut }: { onLoggedOut: () => void }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  async function handleClick() {
    setStatus({ kind: "submitting" });
    try {
      await logoutEverywhere();
      onLoggedOut();
      navigate("/signin", { replace: true });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err, "Something went wrong") });
    }
  }

  return (
    <section className="auth-card">
      <h2>Log out everywhere</h2>
      <p className="auth-switch">
        Ends every session of yours, on every device, including this one.
      </p>
      {status.kind === "error" && <p className="status error">{status.message}</p>}
      <button
        type="button"
        className="full-width"
        onClick={handleClick}
        disabled={status.kind === "submitting"}
      >
        {status.kind === "submitting" ? "Logging out…" : "Log out everywhere"}
      </button>
    </section>
  );
}
