import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { acceptInvite, login, ApiError, type User } from "../api";

// AcceptInvite turns an invite link (/invite#<token>) into an account: the
// invitee picks their name and password, then is logged in. The token comes
// after "#", which browsers never send to a server, and is wiped from the
// address bar as soon as it is read, so it does not linger in history.
export function AcceptInvite({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const navigate = useNavigate();
  const [token] = useState(() => window.location.hash.slice(1));
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!token) {
    return (
      <section className="auth-card">
        <h2>Accept your invite</h2>
        <p className="status error">
          This page needs the full invite link. Open the link you were sent.
        </p>
        <p className="auth-switch">
          <Link to="/signin">Go to log in</Link>
        </p>
      </section>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const created = await acceptInvite(token, fullName, password);
      const user = await login(created.email, password);
      onLoggedIn(user);
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Something went wrong";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <section className="auth-card">
      <h2>Accept your invite</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Full name
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        {status.kind === "error" && (
          <p className="status error">{status.message}</p>
        )}
        <button type="submit" disabled={status.kind === "submitting"}>
          {status.kind === "submitting" ? "Creating account…" : "Create account"}
        </button>
      </form>
    </section>
  );
}
