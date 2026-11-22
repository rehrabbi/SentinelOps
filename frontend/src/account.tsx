import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  acceptPasswordReset,
  changePassword,
  logoutEverywhere,
  ApiError,
  type User,
} from "./api";

// The state of one form submission, the same shape every form here uses.
type FormStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done" };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

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
      navigate("/", { replace: true });
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

// ResetPassword turns a reset link (/reset#<token>) into a new password. Like
// an invite link, the token sits after "#", which browsers never send to a
// server, and is wiped from the address bar as soon as it is read.
//
// Using it ends every session of that account, which may include the one this
// browser holds, so afterwards the app asks the server who is logged in.
export function ResetPassword({ onSessionChanged }: { onSessionChanged: () => void }) {
  const [token] = useState(() => window.location.hash.slice(1));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!token) {
    return (
      <section className="auth-card">
        <h2>Reset your password</h2>
        <p className="status error">
          This page needs the full reset link. Open the link an administrator sent you.
        </p>
        <p className="auth-switch">
          <Link to="/">Go to log in</Link>
        </p>
      </section>
    );
  }

  if (status.kind === "done") {
    return (
      <section className="auth-card">
        <h2>Password reset</h2>
        <p className="status success">
          Your password was changed and every session of your account was logged out.
        </p>
        <p className="auth-switch">
          <Link to="/" replace>
            Log in with your new password
          </Link>
        </p>
      </section>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setStatus({ kind: "error", message: "The passwords do not match" });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      await acceptPasswordReset(token, password);
      setStatus({ kind: "done" });
      onSessionChanged();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err, "Something went wrong") });
    }
  }

  return (
    <section className="auth-card">
      <h2>Reset your password</h2>
      <form onSubmit={handleSubmit}>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
        <button type="submit" disabled={status.kind === "submitting"}>
          {status.kind === "submitting" ? "Saving…" : "Set new password"}
        </button>
      </form>
    </section>
  );
}
