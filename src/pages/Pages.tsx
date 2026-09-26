import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Flame, Dumbbell, MoveUpRight } from "lucide-react";
import { TargetCard } from "../components/TargetCard";
import { Leaderboard } from "../components/Leaderboard";
import { MuscleMap } from "../components/muscle-map/MuscleMap";
import { exercises, muscleLoads } from "../components/muscle-map/model";
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
        <Leaderboard />
      </div>
    </>
  );
}
export function Workout() {
  const [selected, setSelected] = useState(exercises[0].id);
  const loads = muscleLoads([selected]);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MOVE WITH PURPOSE</p>
        <h1>Your training ground.</h1>
        <p>
          Explore the starter exercise library. Workout logging is coming next.
        </p>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>Exercise library</h2>
          <p className="fine">Select a movement to see its muscle mapping.</p>
          <div className="exercise-list">
            {exercises.map((e) => (
              <button
                className={e.id === selected ? "exercise selected" : "exercise"}
                aria-pressed={e.id === selected}
                key={e.id}
                onClick={() => setSelected(e.id)}
              >
                <Dumbbell size={21} />
                <span>
                  <strong>{e.name}</strong>
                  <small>{e.equipment}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="spread">
            <h2>Muscle map</h2>
            <span className="badge">Preview</span>
          </div>
          <div className="maps">
            {(["front", "back"] as const).map((view) => (
              <figure key={view}>
                <MuscleMap view={view} loads={loads} />
                <figcaption>{view}</figcaption>
              </figure>
            ))}
          </div>
          <div className="legend">
            <span>
              <i className="primary-muscle" />
              Primary
            </span>
            <span>
              <i className="support-muscle" />
              Supporting
            </span>
          </div>
          <p className="fine">
            Simplified involvement, not a measurement of activation, fatigue, or
            recovery.
          </p>
          <p className="fine">
            Involved:{" "}
            {Object.keys(loads)
              .map((m) => m.replaceAll("_", " "))
              .join(", ")}
            .
          </p>
        </section>
      </div>
    </>
  );
}
export function Nutrition() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">FUEL THE WORK</p>
        <h1>Good habits, one meal at a time.</h1>
        <p>Your food journal and nutrition goals will come together here.</p>
      </div>
      <section className="card">
        <Flame className="section-icon" />
        <h2>A fresh start.</h2>
        <p>
          Food search, meal logging, and daily totals are planned for the next
          stage.
        </p>
        <div className="empty">
          <p>No meals logged yet.</p>
          <small>Preview only · no nutrition records have been saved.</small>
        </div>
      </section>
    </>
  );
}
export function Progress() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">PLAY THE LONG GAME</p>
        <h1>Small steps. Real progress.</h1>
        <p>
          Your strength, body metrics, and personal bests will build a picture
          over time.
        </p>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>Your story starts here.</h2>
          <div className="empty">
            <p>No measurements or records yet.</p>
            <small>
              Charts and achievements will appear once tracking is connected.
            </small>
          </div>
        </section>
        <Leaderboard />
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
      <section className="card privacy">
        <h2>Private by default.</h2>
        <p>
          Your training and nutrition belong to you. Leaderboard participation
          starts disabled; sharing controls will be added with the leaderboard
          feature.
        </p>
      </section>
    </>
  );
}
