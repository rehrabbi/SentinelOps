import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { login, ApiError, type User } from "../api";

// Sign-in form. On success, hands the user up to App via onLoggedIn.
export function SignIn({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const user = await login(email, password);
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
      <h2>Log in</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {status.kind === "error" && (
          <p className="status error">{status.message}</p>
        )}
        <button type="submit" disabled={status.kind === "submitting"}>
          {status.kind === "submitting" ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="auth-switch">
        Accounts are by invitation. Ask an administrator for an invite link.
      </p>
    </section>
  );
}
