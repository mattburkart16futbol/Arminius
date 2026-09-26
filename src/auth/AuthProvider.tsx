import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  error: string | null;
  recovery: boolean;
}>({ session: null, loading: true, error: null, recovery: false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let receivedEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      receivedEvent = true;
      if (!active) return;
      setSession(next);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT" || event === "USER_UPDATED")
        setRecovery(false);
    });
    void supabase.auth
      .getSession()
      .then(({ data, error: authError }) => {
        if (!active || receivedEvent) return;
        setSession(data.session);
        setError(authError?.message ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("Unable to restore your session. Please try again.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading, error, recovery }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
