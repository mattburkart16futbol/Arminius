import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { exercises, muscleIds } from "../components/muscle-map/model";
import { MuscleMap } from "../components/muscle-map/MuscleMap";
import { exerciseProfile } from "../lib/exercise-guide";
import { tracking, weightLabel } from "../lib/workout";

export function ExerciseGuidePage() {
  const { exerciseId } = useParams();
  const [search, setSearch] = useState("");
  const [equipment, setEquipment] = useState("");
  const [muscle, setMuscle] = useState("");
  const selected = exerciseId
    ? exercises.find((e) => e.id === exerciseId)
    : null;
  const matches = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase().trim()) &&
      (!equipment || e.equipment === equipment) &&
      (!muscle ||
        (muscle === "tibialis"
          ? e.id.includes("tibialis")
          : !e.id.includes("tibialis") &&
            Boolean(e.muscles[muscle as keyof typeof e.muscles]))),
  );
  const profile = selected ? exerciseProfile(selected) : null;
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">KNOW YOUR MOVEMENT</p>
        <h1>Exercise guide</h1>
        <p>
          Explore {exercises.length} exercises, understand their purpose, and
          plan your training.
        </p>
        <Link to="/workout">Back to workout</Link>
      </div>
      <section className="card exercise-guide-search">
        <h2>Find an exercise</h2>
        <div className="picker-filters">
          <label>
            Search exercise profiles
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Bench press, squat, curl…"
            />
          </label>
          <label>
            Equipment
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            >
              <option value="">All equipment</option>
              {[...new Set(exercises.map((e) => e.equipment))]
                .sort()
                .map((x) => (
                  <option key={x}>{x}</option>
                ))}
            </select>
          </label>
          <label>
            Muscle group
            <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
              <option value="">All muscles</option>
              <option value="tibialis">Front of shin</option>
              {muscleIds.map((x) => (
                <option key={x} value={x}>
                  {x.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details open={!selected}>
          <summary>{matches.length} matching exercises</summary>
          {matches.length ? (
            <ul className="exercise-guide-results">
              {matches.map((e) => (
                <li key={e.id}>
                  <Link
                    aria-current={selected?.id === e.id ? "page" : undefined}
                    to={`/exercises/${e.id}`}
                  >
                    {e.name}
                  </Link>
                  <span>{e.equipment}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No matching exercises. Try another name or clear the filters.</p>
          )}
        </details>
      </section>
      {exerciseId && !selected && (
        <section className="card">
          <h2>Exercise not found</h2>
          <Link to="/exercises">Browse all profiles</Link>
        </section>
      )}
      {selected && profile && (
        <article
          className="exercise-profile"
          aria-label={`${selected.name} profile`}
        >
          <section className="card">
            <p className="eyebrow">
              {tracking[selected.id].category} · {selected.equipment}
            </p>
            <h2>{selected.name}</h2>
            <p>{profile.purpose}</p>
            <p>
              <strong>Movement:</strong> {profile.name}
            </p>
            <p>
              <strong>Logging:</strong> {weightLabel(selected.id)}.{" "}
              {tracking[selected.id].mode === "reps"
                ? "Track repetitions."
                : tracking[selected.id].mode === "time"
                  ? "Track seconds."
                  : "Track metres."}
            </p>
          </section>
          <section className="card">
            <h3>Muscles involved</h3>
            <dl className="muscle-role-list">
              <dt>Primary emphasis</dt>
              <dd>{profile.primary.join(", ") || "Varies by technique"}</dd>
              <dt>Secondary involvement</dt>
              <dd>
                {profile.secondary.join(", ") ||
                  "No separate secondary region listed"}
              </dd>
              <dt>Stabilizers</dt>
              <dd>
                {profile.stabilizers.join(", ") ||
                  "Trunk and joint stabilizers vary with setup"}
              </dd>
            </dl>
            {profile.key !== "shin" && (
              <div className="maps">
                {(["front", "back"] as const).map((view) => (
                  <figure key={view}>
                    <MuscleMap view={view} loads={selected.muscles} />
                    <figcaption>{view}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            <p className="fine">
              Broad muscle regions from the exercise catalog. Color shows
              illustrative involvement, not measured activation or a percentage
              of training stimulus. Roles change with technique. The shin
              muscles are not represented on the current map.
            </p>
          </section>
          <div className="exercise-guide-columns">
            <section className="card">
              <h3>
                {profile.specific ? "Technique cues" : "Movement-family cues"}
              </h3>
              <ol>
                {profile.cues.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
              <h4>Common mistake to avoid</h4>
              <p>{profile.avoid}</p>
              {!profile.specific && (
                <p className="fine">
                  General cues for this movement family; equipment setup and
                  variation-specific technique still matter.
                </p>
              )}
            </section>
            <section className="card">
              <h3>Sets, reps & rest</h3>
              <p>
                Example starting points, not a personalized prescription.
                Warm-up sets are separate.
              </p>
              <div className="guide-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Goal</th>
                      <th>Sets</th>
                      <th>Reps / duration</th>
                      <th>Rest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.dose.map((d) => (
                      <tr key={d.goal}>
                        <th scope="row">{d.goal}</th>
                        <td>{d.sets}</td>
                        <td>{d.reps}</td>
                        <td>{d.rest}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4>Progress gradually</h4>
              <p>
                {profile.key === "technical"
                  ? "Prioritize coaching and repeatable technique before increasing load or volume."
                  : "Begin with a manageable effort. When you can repeat the top of your chosen range with consistent technique, increase by the smallest practical step. Change one variable at a time and reduce the load if control deteriorates."}
              </p>
              <p>
                For ordinary working sets, leave a few controlled reps in
                reserve while learning. Stop if you feel sharp pain.
              </p>
            </section>
          </div>
          <section className="card">
            <h3>Superset ideas</h3>
            <p>
              A superset alternates two exercises. Choose a pairing that fits
              your session. Same-session options come first; opposing-muscle and
              mixed-session options are labeled alternatives. These are starting
              ideas, not personalized prescriptions.
            </p>
            {profile.pairs.length ? (
              <ul>
                {profile.pairs.map((e) => (
                  <li key={e.id}>
                    <strong>{e.style}</strong>:{" "}
                    <Link to={`/exercises/${e.id}`}>{e.name}</Link>
                    <p>{e.reason}</p>
                    <p>
                      <strong>Order:</strong> {e.order}
                    </p>
                    <p>
                      <strong>Fatigue to consider:</strong> {e.fatigue}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Use separate sets and full recovery for this movement. No
                automatic pairing is suggested.
              </p>
            )}
            <p>
              For heavy strength work, keep straight sets. For moderate
              accessory work, alternate one set of each exercise, then rest
              about 1–2 minutes or longer until technique and breathing recover.
              Start with fewer rounds and stop the pairing if performance drops.
            </p>
          </section>
          <section className="card">
            <h3>Related lifts to explore</h3>
            <p>
              Related movement options, not identical replacements. Compare
              equipment, range, and muscle emphasis.
            </p>
            <ul>
              {profile.alternatives.map((e) => (
                <li key={e.id}>
                  <Link to={`/exercises/${e.id}`}>{e.name}</Link> ·{" "}
                  {e.equipment}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h3>Training context & sources</h3>
            {selected.id === "cable-jackhammer-pushdown" && (
              <p>
                <a
                  href="https://learn.athleanx.com/articles/chest-workouts"
                  target="_blank"
                  rel="noreferrer"
                >
                  Jackhammer movement reference (ATHLEAN-X)
                </a>
                . Chest-focused cable press variation; this map does not
                distinguish lower-chest fibers.
              </p>
            )}
            <p>
              Spread training across the week and adjust total volume to your
              experience and recovery. These educational profiles are written
              guidance, not live AI coaching.
            </p>
            <ul>
              <li>
                <a
                  href="https://acsm.org/resistance-training-guidelines-update-2026/"
                  target="_blank"
                  rel="noreferrer"
                >
                  ACSM 2026 resistance training guidance
                </a>{" "}
                — general programming principles.
              </li>
              <li>
                <a
                  href="https://www.acefitness.org/continuing-education/certified/june-2024/8648/short-on-time-try-reciprocal-superset-training/"
                  target="_blank"
                  rel="noreferrer"
                >
                  ACE: reciprocal superset training
                </a>{" "}
                — background on alternating exercises.
              </li>
            </ul>
            <p className="fine">
              Reviewed September 28, 2026. The example ranges and pairings are
              Arminius starting suggestions, not exercise-specific prescriptions
              from these sources.
            </p>
          </section>
        </article>
      )}
    </>
  );
}
