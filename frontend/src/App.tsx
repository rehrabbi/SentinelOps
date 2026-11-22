import { useEffect, useState, type FormEvent } from "react";
import "./App.css";
import { acceptInvite, getMe, login, logout, ApiError, type User } from "./api";
import { IncidentDashboard } from "./incidents";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router";
import { AdminPage } from "./admin";

// The auth state is exactly one of these three shapes. 'loading' means we're
// still asking the server (GET /api/me) whether a session exists.
type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; user: User };

function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });

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
      <Routes>
        <Route
          path="/"
          element={
            auth.kind === "authenticated" ? (
              <LoggedIn
                user={auth.user}
                onLogout={() => setAuth({ kind: "anonymous" })}
              />
            ) : (
              <LoginForm onLoggedIn={onLoggedIn} />
            )
          }
        />
        <Route
          path="/invite"
          element={
            auth.kind === "authenticated" ? (
              <Navigate to="/" replace />
            ) : (
              <AcceptInvite onLoggedIn={onLoggedIn} />
            )
          }
        />
        <Route
          path="/admin"
          element={
            auth.kind === "authenticated" && auth.user.role === "admin" ? (
              <AdminPage currentUserId={auth.user.id} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        {/* Anything else goes home rather than showing a blank page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

// Login form. On success, hands the user up to App via onLoggedIn.
function LoginForm({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
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
        Accounts are by invitation. Ask an administrator for an invite link.
      </p>
    </section>
  );
}

// AcceptInvite turns an invite link (/invite#<token>) into an account: the
// invitee picks their name and password, then is logged in. The token comes
// after "#", which browsers never send to a server, and is wiped from the
// address bar as soon as it is read, so it does not linger in history.
function AcceptInvite({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
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
          <Link to="/">Go to log in</Link>
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
    <>
      <section className="auth-card">
        <h2>Welcome, {user.fullName}</h2>
        <p className="subtitle">{user.email}</p>
        <button onClick={handleLogout} disabled={busy}>
          {busy ? "Logging out…" : "Log out"}
        </button>
                {user.role === "admin" && (
          <p className="admin-link">
            <Link to="/admin">Manage user roles</Link>
          </p>
        )}
      </section>
      <IncidentDashboard />
    </>
  );
}

export default App;
