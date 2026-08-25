import { useEffect, useState, type FormEvent } from "react";
import "./App.css";
import { getMe, login, logout, register, ApiError, type User } from "./api";

// The auth state is exactly one of these three shapes. 'loading' means we're
// still asking the server (GET /api/me) whether a session exists.
type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; user: User };

function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  // When anonymous, which form to show.
  const [mode, setMode] = useState<"login" | "register">("login");

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

  const onLoggedIn = (user: User) => setAuth({ kind: "authenticated", user });

  return (
    <main className="app">
      <h1>SentinelOps</h1>
      <p className="subtitle">Incident &amp; ticket management</p>
      {auth.kind === "authenticated" ? (
        <LoggedIn
          user={auth.user}
          onLogout={() => {
            setAuth({ kind: "anonymous"})
            setMode("login")
          }}
        />
      ) : mode === "login" ? (
        <LoginForm
          onLoggedIn={onLoggedIn}
          onSwitch={() => setMode("register")}
        />
      ) : (
        <RegisterForm
          onLoggedIn={onLoggedIn}
          onSwitch={() => setMode("login")}
        />
      )}
    </main>
  );
}

// Login form. On success, hands the user up to App via onLoggedIn.
function LoginForm({
  onLoggedIn,
  onSwitch,
}: {
  onLoggedIn: (user: User) => void;
  onSwitch: () => void;
}) {
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
        Need an account?{" "}
        <button type="button" className="link" onClick={onSwitch}>
          Register
        </button>
      </p>
    </section>
  );
}

// Registration form. Creates the account, then auto-logs-in (registration does
// not start a session), landing the new user in the logged-in view.
function RegisterForm({
  onLoggedIn,
  onSwitch,
}: {
  onLoggedIn: (user: User) => void;
  onSwitch: () => void;
}) {
  const [fullName, setFullName] = useState("");
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
      await register(email, password, fullName);
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
      <h2>Create your account</h2>
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
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
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
          {status.kind === "submitting"
            ? "Creating account…"
            : "Create account"}
        </button>
      </form>
      <p className="auth-switch">
        Have an account?{" "}
        <button type="button" className="link" onClick={onSwitch}>
          Log in
        </button>
      </p>
    </section>
  );
}

// Logged-in view: shows who you are and a logout button.
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
