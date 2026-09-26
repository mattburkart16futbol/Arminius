import { useEffect, useRef } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  Link,
} from "react-router-dom";
import {
  House,
  Dumbbell,
  Apple,
  ChartNoAxesCombined,
  UserRound,
} from "lucide-react";
import { useAuth } from "./auth/AuthProvider";
import { AuthPage } from "./auth/AuthPage";
import { supabase, configurationError } from "./lib/supabase";
import { Home, Nutrition, Profile } from "./pages/Pages";
import { Workout } from "./pages/WorkoutPage";
import { ProgressPage } from "./pages/ProgressPage";
const navigation = [
  { to: "/", label: "Home", icon: House },
  { to: "/workout", label: "Workout", icon: Dumbbell },
  { to: "/nutrition", label: "Nutrition", icon: Apple },
  { to: "/progress", label: "Progress", icon: ChartNoAxesCombined },
  { to: "/profile", label: "Profile", icon: UserRound },
];
function Guard() {
  const { loading, session, error, recovery } = useAuth();
  if (loading)
    return (
      <main className="auth-page" role="status">
        Restoring your session…
      </main>
    );
  if (error)
    return (
      <main className="auth-page">
        <p role="alert">{error}</p>
        <a href="/auth">Try again</a>
      </main>
    );
  if (recovery || (supabase && !session))
    return <Navigate to="/auth" replace />;
  return <Outlet />;
}
function Shell() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.to === location.pathname)?.label ?? "Page not found"} · Arminius`;
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-symbol">A</span>ARMINIUS
        </Link>
        <span className="top-note">BUILT THROUGH CONSISTENCY</span>
        <Link className="avatar" to="/profile" aria-label="Your profile">
          <UserRound size={20} />
        </Link>
      </header>
      {!supabase && (
        <div className="preview-banner" role="status">
          {configurationError ??
            "Foundation preview · sample content, no data is saved"}
        </div>
      )}
      <main id="main" ref={main} tabIndex={-1} className="app-main">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink end={to === "/"} key={to} to={to}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<Guard />}>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="workout" element={<Workout />} />
          <Route path="nutrition" element={<Nutrition />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="profile" element={<Profile />} />
          <Route
            path="*"
            element={
              <section className="card">
                <h1>Page not found.</h1>
                <Link to="/">Return home</Link>
              </section>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
