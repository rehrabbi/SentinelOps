import { lazy, startTransition, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { getMe, logout, onSessionExpired, type User } from "./api";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router";
import { AppShell } from "./layout/AppShell";
import { LoadingFrame, PageLoading } from "./layout/LoadingFrame";
import { PublicShell } from "./layout/PublicShell";
import { useRouteFocus } from "./layout/useRouteFocus";
import { AcceptInvite } from "./pages/AcceptInvite";
import { Landing } from "./pages/Landing";
import { Privacy } from "./pages/Privacy";
import { ResetPassword } from "./pages/ResetPassword";
import { SignIn } from "./pages/SignIn";

// The signed-in screens load on demand, as their own files, so the public pages (landing, sign
// in, invite, reset, privacy) never download them. They come from this site like every other
// script, so the CSP's script-src 'self' covers them.
const loadIncidents = () => import("./pages/Incidents");
const Incidents = lazy(() => loadIncidents().then((m) => ({ default: m.Incidents })));
const AccountPage = lazy(() => import("./pages/Account").then((m) => ({ default: m.AccountPage })));
const UsersPage = lazy(() => import("./pages/Users").then((m) => ({ default: m.UsersPage })));

// The auth state is exactly one of these three shapes. 'loading' means we're
// still asking the server (GET /api/me) whether a session exists.
// sessionEnded marks an anonymous state reached because the session ended
// mid-use, so the sign-in screen can say why the person is there.
type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous"; sessionEnded?: boolean }
  | { kind: "authenticated"; user: User };

export interface AppProps {
  /**
   * The session check main.tsx started before the first render, used once instead of asking
   * again on mount. Without it (as in tests) App asks itself.
   */
  firstSessionCheck?: Promise<User | null>;
}

function App({ firstSessionCheck }: AppProps) {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Titles every page and, after an in-app navigation, moves focus to the new page's heading.
  useRouteFocus(auth.kind === "loading" ? null : auth.kind === "authenticated");

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
  useEffect(
    () =>
      onSessionExpired(() => {
        if (authRef.current.kind !== "authenticated") return;
        const ended: AuthState = { kind: "anonymous", sessionEnded: true };
        authRef.current = ended;
        startTransition(() => {
          setAuth(ended);
          navigate("/signin", { replace: true });
        });
      }),
    [navigate]
  );

  // Ask the server who is logged in. Runs on load, and again after anything
  // that may have ended this browser's session from elsewhere.
  function refreshSession(check: Promise<User | null> = getMe()) {
    check
      .then((user) =>
        setAuth(user ? { kind: "authenticated", user } : { kind: "anonymous" })
      )
      .catch(() => setAuth({ kind: "anonymous" }));
  }

  // On load, use the check main.tsx already started, if any. It is one promise for the app's
  // life, so this runs once (twice in development's StrictMode, sharing that one request).
  useEffect(() => {
    refreshSession(firstSessionCheck ?? getMe());
  }, [firstSessionCheck]);

  // Someone on the sign-in or invite page is about to land on the incidents screen: fetch its
  // code while they type, so it is ready when they arrive. Never on the landing page itself.
  const aboutToSignIn = auth.kind === "anonymous" && (pathname === "/signin" || pathname === "/invite");
  useEffect(() => {
    if (!aboutToSignIn) return;
    const timer = setTimeout(() => void loadIncidents().catch(() => {}), 1000);
    return () => clearTimeout(timer);
  }, [aboutToSignIn]);

  if (auth.kind === "loading") return <LoadingFrame />;

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
      // Ignored on purpose: the local sign-out below happens either way.
    }
    onLoggedOut();
    navigate("/", { replace: true });
  }

  const signedIn = (page: ReactNode) =>
    user ? (
      <AppShell user={user} onLogout={handleLogout}>
        <Suspense fallback={<PageLoading />}>{page}</Suspense>
      </AppShell>
    ) : null;
  const pub = (page: ReactNode, headerAction?: ReactNode) => (
    <PublicShell headerAction={headerAction}>{page}</PublicShell>
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          user
            ? signedIn(<Incidents />)
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
            pub(<AcceptInvite onLoggedIn={onLoggedIn} />)
          )
        }
      />
      {/* Open whether or not someone is logged in: an admin may follow a
          link in a browser that holds their own session. */}
      <Route
        path="/reset"
        element={pub(<ResetPassword onSessionChanged={() => refreshSession()} />)}
      />
      <Route path="/privacy" element={pub(<Privacy />)} />
      <Route
        path="/account"
        element={
          user ? (
            signedIn(<AccountPage user={user} onLoggedOut={onLoggedOut} />)
          ) : (
            <Navigate to="/signin" replace />
          )
        }
      />
      <Route
        path="/admin"
        element={
          user && user.role === "admin" ? (
            signedIn(<UsersPage currentUserId={user.id} />)
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
