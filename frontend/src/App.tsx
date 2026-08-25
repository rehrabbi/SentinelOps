import { useEffect, useState, type FormEvent } from "react";
import "./App.css";
import { getMe, login, logout, ApiError, type User } from "./api";

// The auth state is exactly one of these three shapes. 'loading' means we're
// still asking the server (GET /api/me) whether a session exists.
type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; user: User };

function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });

  // On first render, ask the server who we are. getMe() returns the user, or
  // null on 401 (not logged in). We treat any error as "anonymous" for now.
  useEffect(() => {
    getMe()
      .then((user) =>
        setAuth(user ? { kind: "authenticated", user } : { kind: "anonymous" })
      )
      .catch(() => setAuth({ kind: "anonymous" }));
  }, []);

  if (auth.kind === "loading") {
    return (
      <main className="app">
        <h1>SentinelOps</h1>
        <p className="status loading">Checking your session…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <h1>SentinelOps</h1>
      <p className="subtitle">Incident &amp; ticket management</p>
      {auth.kind === "authenticated" ? (
        <LoggedIn
          user={auth.user}
          onLogout={() => setAuth({ kind: "anonymous" })}
        />
      ) : (
        <LoginForm
          onLoggedIn={(user) => setAuth({ kind: "authenticated", user })}
        />
      )}
    </main>
  );
}

// The login form. On submit it calls the API and, on success, hands the user
// up to App via onLoggedIn.
function LoginForm({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); // stop the browser's default full-page form submission
    setStatus({ kind: "submitting" });
    try {
      const user = await login(email, password);
      onLoggedIn(user);
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
    </section>
  );
}

// The logged-in view: shows who you are and a logout button.
function LoggedIn({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
    } catch {
      // Logout is idempotent server-side; clear local state regardless.
    }
    onLogout();
  }

  return (
    <section className="auth-card">
      <h2>Welcome, {user.fullName}</h2>
      <p className="subtitle">{user.email}</p>
      <button onClick={handleLogout} disabled={busy}>
        {busy ? "Logging out…" : "Log out"}
      </button>
    </section>
  );
}

export default App;
