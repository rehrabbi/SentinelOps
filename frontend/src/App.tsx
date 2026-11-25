import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import "./App.css";
import { getMe, logout, onSessionExpired, type User } from "./api";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router";
import { AppShell } from "./layout/AppShell";
import { PublicShell } from "./layout/PublicShell";
import { AcceptInvite } from "./pages/AcceptInvite";
import { AccountPage } from "./pages/Account";
import { Incidents } from "./pages/Incidents";
import { Landing } from "./pages/Landing";
import { Privacy } from "./pages/Privacy";
import { ResetPassword } from "./pages/ResetPassword";
import { SignIn } from "./pages/SignIn";
import { UsersPage } from "./pages/Users";

// The auth state is exactly one of these three shapes. 'loading' means we're
// still asking the server (GET /api/me) whether a session exists.
// sessionEnded marks an anonymous state reached because the session ended
// mid-use, so the sign-in screen can say why the person is there.
type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous"; sessionEnded?: boolean }
  | { kind: "authenticated"; user: User };

function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const navigate = useNavigate();

  // The latest auth state, for the expiry handler below, which outlives renders.
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  // A 401 from any working request means the session ended under us: sign the
  // app out and send the person to sign in again, once. Several requests can
  // fail together (and a late one can land after sign-out), so only the first
  // 401 while signed in acts; the rest find the state already anonymous.
  // The router moves to a new location inside a transition. Signing out inside
  // the same transition means both land in one render; otherwise the page's own
  // guard (e.g. /admin's "not an admin, go home") would see the signed-out state
  // first and send the person to "/" instead.
  useEffect(() => {
    onSessionExpired(() => {
      if (authRef.current.kind !== "authenticated") return;
      const ended: AuthState = { kind: "anonymous", sessionEnded: true };
      authRef.current = ended;
      startTransition(() => {
        setAuth(ended);
        navigate("/signin", { replace: true });
      });
    });
    return () => onSessionExpired(() => {});
  }, [navigate]);

  // Ask the server who is logged in. Runs on load, and again after anything
  // that may have ended this browser's session from elsewhere.
  function refreshSession() {
    getMe()
      .then((user) =>
        setAuth(user ? { kind: "authenticated", user } : { kind: "anonymous" })
      )
      .catch(() => setAuth({ kind: "anonymous" }));
  }

  useEffect(refreshSession, []);

  if (auth.kind === "loading") {
    return (
      <PublicShell>
        <p className="status loading">Checking your session…</p>
      </PublicShell>
    );
  }

  const onLoggedIn = (user: User) => setAuth({ kind: "authenticated", user });
  const onLoggedOut = () => setAuth({ kind: "anonymous" });
  const user = auth.kind === "authenticated" ? auth.user : null;

  // The shell's Log out: end the session on the server, then drop the local
  // state and go to the front door. Logout is idempotent server-side, so a
  // failed call still clears local state.
  async function handleLogout() {
    try {
      await logout();
    } catch {
      // see above
    }
    onLoggedOut();
    navigate("/", { replace: true });
  }

  const signedIn = (page: ReactNode) =>
    user ? (
      <AppShell user={user} onLogout={handleLogout}>
        {page}
      </AppShell>
    ) : null;
  // Today's screens keep their old column (App.css) until each is redesigned.
  const legacy = (page: ReactNode) => <div className="app">{page}</div>;
  const pub = (page: ReactNode, headerAction?: ReactNode) => (
    <PublicShell headerAction={headerAction}>{page}</PublicShell>
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          user
            ? signedIn(legacy(<Incidents />))
            : pub(
                <Landing />,
                <Link to="/signin" className="ui-btn ui-btn-primary">
                  Sign in
                </Link>
              )
        }
      />
      <Route
        path="/signin"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            pub(
              <SignIn
                onLoggedIn={onLoggedIn}
                sessionEnded={auth.kind === "anonymous" && auth.sessionEnded === true}
              />
            )
          )
        }
      />
      <Route
        path="/invite"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            pub(legacy(<AcceptInvite onLoggedIn={onLoggedIn} />))
          )
        }
      />
      {/* Open whether or not someone is logged in: an admin may follow a
          link in a browser that holds their own session. */}
      <Route
        path="/reset"
        element={pub(legacy(<ResetPassword onSessionChanged={refreshSession} />))}
      />
      <Route path="/privacy" element={pub(<Privacy />)} />
      <Route
        path="/account"
        element={
          user ? (
            signedIn(legacy(<AccountPage user={user} onLoggedOut={onLoggedOut} />))
          ) : (
            <Navigate to="/signin" replace />
          )
        }
      />
      <Route
        path="/admin"
        element={
          user && user.role === "admin" ? (
            signedIn(legacy(<UsersPage currentUserId={user.id} />))
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      {/* Anything else goes home rather than showing a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
