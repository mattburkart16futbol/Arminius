import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MoveUpRight } from "lucide-react";
import { TargetCard } from "../components/TargetCard";
import { TrendingThisWeek } from "../components/TrendingThisWeek";
import { SocialComparisonSettings } from "../components/SocialComparisonSettings";
import { BodyweightEntry } from "../components/BodyweightEntry";
import { MuscleMap } from "../components/muscle-map/MuscleMap";
import { muscleLoads } from "../components/muscle-map/model";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";

export function Home() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">A LITTLE BETTER, EVERY DAY</p>
        <h1>Build your momentum.</h1>
        <p>Your training, nutrition, and progress. All in one place.</p>
      </div>
      <div className="dashboard-grid">
        <section className="hero">
          <p className="eyebrow">THE WORK STARTS HERE</p>
          <h2>
            Show up.
            <br />
            Get stronger.
          </h2>
          <p>Make room for your next good session.</p>
          <Link className="primary" to="/workout">
            Explore your training <ArrowUpRight size={18} />
          </Link>
          <div className="hero-mark" aria-hidden="true">
            A
          </div>
          <small>ARMINIUS / FOUNDATION 01</small>
        </section>
        <section className="card">
          <div className="spread">
            <h2>Daily targets</h2>
            <span className="badge">Sample data</span>
          </div>
          <TargetCard
            label="Movement"
            value={2}
            target={4}
            unit="sessions / week"
          />
          <TargetCard label="Protein" value={95} target={140} unit="g" />
          <TargetCard label="Energy" value={1650} target={2200} unit="kcal" />
          <p className="fine">
            Illustrative targets only. Your own goals will live here.
          </p>
        </section>
        <section className="card">
          <p className="eyebrow">TRAIN WITH INTENTION</p>
          <h2>See the work.</h2>
          <div className="map-preview">
            <MuscleMap view="front" loads={muscleLoads(["squat"])} />
            <div>
              <span className="badge">Exercise preview</span>
              <h3>More than a rep count.</h3>
              <p>Explore the muscles involved in each movement.</p>
              <Link className="text-link" to="/workout">
                Open muscle map <MoveUpRight size={16} />
              </Link>
            </div>
          </div>
        </section>
        <TrendingThisWeek />
        <Link className="text-link" to="/leaderboards">
          Explore benchmark leaderboards
        </Link>
      </div>
    </>
  );
}
export function Profile() {
  const { session } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await supabase?.auth.signOut();
      if (result?.error) throw result.error;
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MAKE IT YOURS</p>
        <h1>Your space.</h1>
      </div>
      <section className="card">
        <h2>{session ? "Account" : "Take the first step."}</h2>
        <p>
          {session?.user.email ??
            "Create an account to begin your journey when account access is connected."}
        </p>
        {session ? (
          <button onClick={signOut} disabled={busy}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        ) : (
          <Link className="primary" to="/auth">
            Account access <ArrowUpRight size={18} />
          </Link>
        )}
        <p role="alert">{error}</p>
      </section>
      <BodyweightEntry />
      <SocialComparisonSettings />
    </>
  );
}
