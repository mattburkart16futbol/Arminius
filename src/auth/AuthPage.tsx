import { useState, type FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase, configurationError } from "../lib/supabase";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "signup" | "reset" | "update";
export function AuthPage() {
  const { session, recovery } = useAuth();
  const [selectedMode, setMode] = useState<Mode>("login");
  const mode = recovery ? "update" : selectedMode;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (session && !recovery) return <Navigate to="/" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const redirectTo = new URL("/auth", window.location.origin).href;
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : mode === "signup"
            ? await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: redirectTo },
              })
            : mode === "reset"
              ? await supabase.auth.resetPasswordForEmail(email, { redirectTo })
              : await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setMessage(
        mode === "reset"
          ? "If an account exists, a reset link is on its way. Check your email."
          : mode === "signup"
            ? "Check your email to confirm your account."
            : "Your password has been updated.",
      );
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title = {
    login: "Welcome back.",
    signup: "Start your journey.",
    reset: "Reset your password.",
    update: "Choose a new password.",
  }[mode];
  return (
    <main className="auth-page">
      <Link className="brand" to="/">
        A / ARMINIUS
      </Link>
      <section className="card">
        <p className="eyebrow">YOUR NEXT CHAPTER</p>
        <h1>{title}</h1>
        {!supabase && (
          <p role="status">
            {configurationError ??
              "Account access will be available once Supabase is connected. You can explore the preview now."}
          </p>
        )}
        <form onSubmit={submit}>
          {mode !== "update" && (
            <label>
              Email
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Password
              <input
                type="password"
                minLength={8}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          <button className="primary" disabled={busy || !supabase}>
            {busy
              ? "Please wait…"
              : {
                  login: "Sign in",
                  signup: "Create account",
                  reset: "Send reset link",
                  update: "Save password",
                }[mode]}
          </button>
        </form>
        <p role="alert">{error}</p>
        <p role="status">{message}</p>
        {!recovery && (
          <div className="button-row">
            {(["login", "signup", "reset"] as const)
              .filter((m) => m !== mode)
              .map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setError("");
                    setMessage("");
                  }}
                >
                  {
                    {
                      login: "Sign in",
                      signup: "Create account",
                      reset: "Forgot password?",
                    }[m]
                  }
                </button>
              ))}
          </div>
        )}
      </section>
    </main>
  );
}
