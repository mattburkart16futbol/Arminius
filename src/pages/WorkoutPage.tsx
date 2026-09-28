import { Link } from "react-router-dom";
import { WorkoutTextEntry } from "../components/WorkoutTextEntry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import {
  exercises,
  muscleIds,
  muscleLoads,
} from "../components/muscle-map/model";
import { MuscleMap } from "../components/muscle-map/MuscleMap";
import {
  displayWeight,
  exerciseName,
  kgPerLb,
  newSet,
  numberValue,
  tracking,
  validateWorkout,
  weightLabel,
  type Unit,
  type WorkoutEntry,
  type SetEntry,
} from "../lib/workout";
import {
  loadDetails,
  saveWorkout,
  workoutColumns,
  workoutError,
  type WorkoutRow,
} from "../lib/workout-api";

export function Workout() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [active, setActive] = useState<WorkoutEntry | null>(null);
  const [history, setHistory] = useState<WorkoutEntry[]>([]);
  const [units, setUnits] = useState<Unit>("metric");
  const [name, setName] = useState("Workout");
  const [search, setSearch] = useState("");
  const [equipment, setEquipment] = useState("all");
  const [muscle, setMuscle] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState(exercises[0].id);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restEnd, setRestEnd] = useState(0);
  const [now, setNow] = useState(Date.now());
  const saving = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const generation = useRef(0);
  const filtered = useMemo(
    () =>
      exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase().trim()) &&
          (equipment === "all" || e.equipment === equipment) &&
          (muscle === "all" || Object.keys(e.muscles).includes(muscle)) &&
          (category === "all" || tracking[e.id].category === category),
      ),
    [search, equipment, muscle, category],
  );
  const chosen = filtered.some((e) => e.id === selected)
    ? selected
    : (filtered[0]?.id ?? "");
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [profile, current, recent] = await Promise.all([
        supabase
          .from("profiles")
          .select("unit_system")
          .eq("id", userId)
          .single(),
        supabase
          .from("workouts")
          .select(workoutColumns)
          .eq("user_id", userId)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1),
        supabase
          .from("workouts")
          .select(workoutColumns)
          .eq("user_id", userId)
          .not("ended_at", "is", null)
          .order("started_at", { ascending: false })
          .limit(20),
      ]);
      if (profile.error) throw profile.error;
      if (current.error) throw current.error;
      if (recent.error) throw recent.error;
      const [open, finished] = await Promise.all([
        loadDetails(current.data as WorkoutRow[]),
        loadDetails(recent.data as WorkoutRow[]),
      ]);
      if (version !== generation.current) return;
      setUnits(profile.data.unit_system === "imperial" ? "imperial" : "metric");
      let restored: WorkoutEntry | null = null;
      try {
        const raw = sessionStorage.getItem(`arminius-draft:${userId}`);
        if (raw) {
          const draft = JSON.parse(raw) as WorkoutEntry;
          if (
            (open[0]?.id === draft.id && open[0].revision === draft.revision) ||
            (!open.length && draft.revision === 0)
          )
            restored = draft;
          else sessionStorage.removeItem(`arminius-draft:${userId}`);
        }
      } catch {
        /* Storage may be unavailable. */
      }
      setActive(restored ?? open[0] ?? null);
      setHistory(finished);
      setDirty(Boolean(restored));
      request.current = null;
      if (restored)
        setNotice(
          "Your unsaved edits from this tab were restored. Save to keep them in your account.",
        );
    } catch (e) {
      if (version === generation.current) setError(workoutError(e));
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    const pending = generation;
    void refresh();
    return () => {
      pending.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const link = (e: MouseEvent) => {
      if (
        (e.target as Element).closest("a[href]") &&
        !window.confirm("Leave without saving your latest workout edits?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", link, true);
    };
  }, [dirty, busy]);
  useEffect(() => {
    if (!restEnd) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [restEnd]);
  function cacheDraft(next: WorkoutEntry | null) {
    if (!userId) return;
    try {
      if (next)
        sessionStorage.setItem(
          `arminius-draft:${userId}`,
          JSON.stringify(next),
        );
      else sessionStorage.removeItem(`arminius-draft:${userId}`);
    } catch {
      /* Unsaved navigation warning remains when storage is unavailable. */
    }
  }
  function edit(next: WorkoutEntry) {
    cacheDraft(next);
    setActive(next);
    setDirty(true);
    setNotice("");
  }
  function updateSet(liftId: string, id: string, patch: Partial<SetEntry>) {
    if (!active) return;
    edit({
      ...active,
      exercises: active.exercises.map((l) =>
        l.id === liftId
          ? {
              ...l,
              sets: l.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
            }
          : l,
      ),
    });
  }
  async function persist(
    next: WorkoutEntry,
    finish = false,
    completedSet = false,
  ) {
    if (saving.current) return;
    const invalid = validateWorkout(next, finish);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!supabase) {
      setError("Connect Supabase to save a workout.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify({ next, finish });
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    try {
      const saved = await saveWorkout(next, finish, request.current.id);
      cacheDraft(null);
      const result = { ...next, ...saved };
      setActive(finish ? null : result);
      setDirty(false);
      request.current = null;
      if (finish) {
        setHistory((h) =>
          [result, ...h.filter((w) => w.id !== result.id)].slice(0, 20),
        );
        setRestEnd(0);
      }
      if (completedSet) {
        setRestEnd(Date.now() + 90000);
        setNow(Date.now());
      }
      setNotice(
        finish ? "Workout finished and saved." : "All workout edits saved.",
      );
    } catch (e) {
      cacheDraft(next);
      setError(workoutError(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function start() {
    const next: WorkoutEntry = {
      id: crypto.randomUUID(),
      name,
      started_at: new Date().toISOString(),
      ended_at: null,
      revision: 0,
      exercises: [],
    };
    setActive(next);
    setDirty(true);
    void persist(next);
  }
  async function discard() {
    if (
      !active ||
      saving.current ||
      !window.confirm("Discard this workout and all its sets?")
    )
      return;
    saving.current = true;
    setBusy(true);
    try {
      if (supabase) {
        const r = await supabase
          .from("workouts")
          .delete()
          .eq("id", active.id)
          .eq("revision", active.revision)
          .is("ended_at", null)
          .select("id");
        if (r.error) throw r.error;
        if (!r.data.length && active.revision > 0) throw { code: "40001" };
      }
      cacheDraft(null);
      setActive(null);
      setDirty(false);
      setError("");
      setRestEnd(0);
    } catch (e) {
      setError(workoutError(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function addExercise() {
    if (!active || !chosen) return;
    const last = history
      .flatMap((w) => w.exercises)
      .find(
        (l) =>
          l.exercise_id === chosen &&
          l.sets.some((s) => s.completed_at && s.kind !== "warmup"),
      );
    const previous = last?.sets.find(
      (s) => s.completed_at && s.kind !== "warmup",
    );
    edit({
      ...active,
      exercises: [
        ...active.exercises,
        {
          id: crypto.randomUUID(),
          exercise_id: chosen,
          sets: [newSet(previous)],
        },
      ],
    });
  }
  const rest = Math.max(0, Math.ceil((restEnd - now) / 1000));
  const loads = muscleLoads(chosen ? [chosen] : []);
  function summary(s: SetEntry, id: string) {
    const info = tracking[id];
    return `${displayWeight(s.weight_kg, units) || "0"} ${units === "imperial" ? "lb" : "kg"}${info?.load === "per_dumbbell" ? " per dumbbell" : info?.load === "assistance" ? " assistance" : ""} × ${info?.mode === "time" ? `${s.duration_seconds} sec` : info?.mode === "distance" ? `${s.distance_m} m` : `${s.reps} reps`}`;
  }
  if (loading)
    return (
      <section className="card" role="status">
        Loading your training…
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MOVE WITH PURPOSE</p>
        <h1>Your training ground.</h1>
        <p>Log the work. See what changes.</p>
      </div>
      {error && (
        <div className="card">
          <p role="alert">{error}</p>
          <button
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Reload saved data and discard unsaved edits?")
              )
                void refresh();
            }}
          >
            Reload saved data
          </button>
        </div>
      )}
      <p role="status">{notice}</p>
      {!supabase && (
        <p className="badge">Preview · browse 300 exercises; sign in to save</p>
      )}
      {!active && supabase && (
        <section className="card start-workout-card">
          <h2>Start a workout</h2>
          <label>
            Workout name
            <input
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={busy || Boolean(error)}
            onClick={start}
          >
            Start workout
          </button>
        </section>
      )}
      <fieldset disabled={busy} className="logger-fieldset">
        <WorkoutTextEntry key={userId ?? "preview"} units={units}
          remaining={50 - (active?.exercises.length ?? 0)}
          onAdd={active ? (lifts) => edit({ ...active, exercises: [...active.exercises, ...lifts] }) : undefined} />
        <section className="card picker-card">
          <h2>Exercise library</h2>
          <p><Link to="/exercises">Browse exercise profiles</Link></p>
          <div className="picker-filters">
            <label>
              Search exercises
              <input
                type="search"
                placeholder="Squat, bench, row…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Equipment
              <select
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
              >
                <option value="all">All equipment</option>
                {[...new Set(exercises.map((e) => e.equipment))]
                  .sort()
                  .map((e) => (
                    <option key={e}>{e}</option>
                  ))}
              </select>
            </label>
            <label>
              Muscle
              <select
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
              >
                <option value="all">All muscles</option>
                {muscleIds.map((m) => (
                  <option key={m} value={m}>
                    {m.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Training group
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All groups</option>
                {["push", "pull", "legs", "core", "full"].map((c) => (
                  <option key={c} value={c}>
                    {c === "full" ? "Full body" : c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="picker-select">
            <label>
              Exercise
              <select
                aria-label="Exercise"
                value={chosen}
                onChange={(e) => setSelected(e.target.value)}
                disabled={!filtered.length}
              >
                {!filtered.length && (
                  <option value="">No matching exercises</option>
                )}
                {filtered.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            {active && (
              <button
                className="primary"
                disabled={!chosen}
                onClick={addExercise}
              >
                Add exercise
              </button>
            )}
          </div>
          <p className="fine">{filtered.length} of 300 exercises</p>
          {chosen && <p><Link to={`/exercises/${chosen}`}>View muscles, technique & training suggestions</Link></p>}
          <details>
            <summary>Preview muscle involvement</summary>
            <div className="maps">
              {(["front", "back"] as const).map((view) => (
                <figure key={view}>
                  <MuscleMap view={view} loads={loads} />
                  <figcaption>{view}</figcaption>
                </figure>
              ))}
            </div>
          </details>
        </section>
        {active && (
          <>
            <section className="card workout-controls">
              <label>
                Session name
                <input
                  value={active.name}
                  maxLength={200}
                  onChange={(e) => edit({ ...active, name: e.target.value })}
                />
              </label>
              <label>
                Display units
                <select
                  value={units}
                  onChange={(e) => setUnits(e.target.value as Unit)}
                >
                  <option value="metric">kg</option>
                  <option value="imperial">lb</option>
                </select>
              </label>
              <p className="fine">
                Display only; stored in kg. Distance is in metres.
              </p>
              <div className="rest-timer">
                <span role="timer" aria-label="Rest remaining">
                  {rest
                    ? `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}`
                    : "Rest"}
                </span>
                {[60, 90, 120].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setRestEnd(Date.now() + t * 1000);
                      setNow(Date.now());
                    }}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </section>
            {active.exercises.length === 0 && (
              <p className="empty">Choose an exercise above to begin.</p>
            )}
            {active.exercises.map((lift) => {
              const info = tracking[lift.exercise_id];
              const prior = history
                .flatMap((w) =>
                  w.exercises.map((l) => ({ lift: l, date: w.started_at })),
                )
                .find(
                  ({ lift: l }) =>
                    l.exercise_id === lift.exercise_id &&
                    l.sets.some((s) => s.completed_at && s.kind !== "warmup"),
                );
              return (
                <article className="card workout-exercise-card" key={lift.id}>
                  <div className="spread">
                    <h2>{exerciseName(lift.exercise_id)}</h2>
                    <button
                      onClick={() => {
                        if (
                          window.confirm("Remove this exercise and its sets?")
                        )
                          edit({
                            ...active,
                            exercises: active.exercises.filter(
                              (l) => l.id !== lift.id,
                            ),
                          });
                      }}
                    >
                      Remove exercise
                    </button>
                  </div>
                  <p className="fine">
                    {info.load === "per_dumbbell"
                      ? "Enter the individual dumbbell weight. For alternating movements, enter reps per side."
                      : info.load === "assistance"
                        ? "Enter machine assistance; more assistance does not mean greater strength."
                        : info.load === "added"
                          ? "Enter added external weight only; bodyweight is not inferred."
                          : "Enter the total external load; include the bar when applicable."}
                  </p>
                  <details className="previous-performance">
                    <summary>Previous performance</summary>
                    {prior ? (
                      <>
                        <small>
                          {new Date(prior.date).toLocaleDateString()}
                        </small>
                        <p>
                          {prior.lift.sets
                            .filter(
                              (s) => s.completed_at && s.kind !== "warmup",
                            )
                            .map((s, i) => (
                              <span key={s.id}>
                                Set {i + 1}: {summary(s, lift.exercise_id)}
                                {" · "}
                              </span>
                            ))}
                        </p>
                      </>
                    ) : (
                      <p>
                        No completed working sets in your latest 20 sessions.
                      </p>
                    )}
                  </details>
                  {lift.sets.map((s, i) => (
                    <section
                      className="set-card"
                      key={s.id}
                      aria-label={`${exerciseName(lift.exercise_id)} set ${i + 1}`}
                    >
                      <div className="spread">
                        <strong>Set {i + 1}</strong>
                        <span className="badge">
                          {s.completed_at ? "Completed" : "Draft"}
                          {dirty ? " · unsaved edits" : ""}
                        </span>
                      </div>
                      <div className="set-inputs">
                        <label>
                          {weightLabel(lift.exercise_id)} (
                          {units === "imperial" ? "lb" : "kg"})
                          <input
                            aria-label={`Set ${i + 1} ${weightLabel(lift.exercise_id).toLowerCase()}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={displayWeight(s.weight_kg, units)}
                            onChange={(e) => {
                              const n = numberValue(e.target.value);
                              updateSet(lift.id, s.id, {
                                weight_kg:
                                  n === null
                                    ? null
                                    : n * (units === "imperial" ? kgPerLb : 1),
                              });
                            }}
                          />
                        </label>
                        <label>
                          {info.mode === "time"
                            ? "Seconds"
                            : info.mode === "distance"
                              ? "Distance (m)"
                              : "Reps"}
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step={info.mode === "distance" ? "any" : "1"}
                            value={
                              (info.mode === "time"
                                ? s.duration_seconds
                                : info.mode === "distance"
                                  ? s.distance_m
                                  : s.reps) ?? ""
                            }
                            onChange={(e) =>
                              updateSet(lift.id, s.id, {
                                [info.mode === "time"
                                  ? "duration_seconds"
                                  : info.mode === "distance"
                                    ? "distance_m"
                                    : "reps"]: numberValue(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="button-row">
                        <button
                          onClick={() =>
                            updateSet(lift.id, s.id, {
                              weight_kg: Math.max(
                                0,
                                (s.weight_kg ?? 0) -
                                  (units === "imperial" ? 5 * kgPerLb : 2.5),
                              ),
                            })
                          }
                        >
                          −{units === "imperial" ? "5 lb" : "2.5 kg"}
                        </button>
                        <button
                          onClick={() =>
                            updateSet(lift.id, s.id, {
                              weight_kg:
                                (s.weight_kg ?? 0) +
                                (units === "imperial" ? 5 * kgPerLb : 2.5),
                            })
                          }
                        >
                          +{units === "imperial" ? "5 lb" : "2.5 kg"}
                        </button>
                      </div>
                      <details>
                        <summary>Set type & effort</summary>
                        <div className="set-inputs">
                          <label>
                            Type
                            <select
                              value={s.kind}
                              onChange={(e) =>
                                updateSet(lift.id, s.id, {
                                  kind: e.target.value as SetEntry["kind"],
                                })
                              }
                            >
                              <option value="working">Working</option>
                              <option value="warmup">Warm-up</option>
                              <option value="dropset">Drop set</option>
                            </select>
                          </label>
                          <label>
                            RPE (1–10)
                            <input
                              type="number"
                              min="1"
                              max="10"
                              step="0.5"
                              value={s.rpe ?? ""}
                              onChange={(e) =>
                                updateSet(lift.id, s.id, {
                                  rpe: numberValue(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            RIR (0–10)
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={s.rir ?? ""}
                              onChange={(e) =>
                                updateSet(lift.id, s.id, {
                                  rir: numberValue(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                        <p className="fine">
                          RPE is perceived effort; RIR is estimated reps
                          remaining. Both are optional.
                        </p>
                      </details>
                      <div className="button-row">
                        <button
                          className="primary"
                          onClick={() => {
                            const next = {
                              ...active,
                              exercises: active.exercises.map((l) =>
                                l.id === lift.id
                                  ? {
                                      ...l,
                                      sets: l.sets.map((row) =>
                                        row.id === s.id
                                          ? {
                                              ...row,
                                              completed_at:
                                                row.completed_at ??
                                                new Date().toISOString(),
                                            }
                                          : row,
                                      ),
                                    }
                                  : l,
                              ),
                            };
                            edit(next);
                            void persist(next, false, true);
                          }}
                        >
                          Complete & save set {i + 1}
                        </button>
                        <button
                          onClick={() =>
                            edit({
                              ...active,
                              exercises: active.exercises.map((l) =>
                                l.id === lift.id
                                  ? {
                                      ...l,
                                      sets: l.sets.filter(
                                        (row) => row.id !== s.id,
                                      ),
                                    }
                                  : l,
                              ),
                            })
                          }
                        >
                          Delete set {i + 1}
                        </button>
                        {s.completed_at && (
                          <button
                            onClick={() =>
                              updateSet(lift.id, s.id, { completed_at: null })
                            }
                          >
                            Mark draft
                          </button>
                        )}
                      </div>
                    </section>
                  ))}
                  <div className="button-row">
                    <button
                      onClick={() =>
                        edit({
                          ...active,
                          exercises: active.exercises.map((l) =>
                            l.id === lift.id
                              ? { ...l, sets: [...l.sets, newSet()] }
                              : l,
                          ),
                        })
                      }
                    >
                      Add set
                    </button>
                    <button
                      disabled={!lift.sets.length}
                      onClick={() =>
                        edit({
                          ...active,
                          exercises: active.exercises.map((l) =>
                            l.id === lift.id
                              ? {
                                  ...l,
                                  sets: [...l.sets, newSet(l.sets.at(-1))],
                                }
                              : l,
                          ),
                        })
                      }
                    >
                      Repeat last set
                    </button>
                  </div>
                </article>
              );
            })}
            <section className="card workout-save">
              <p>
                {dirty ? "You have unsaved edits." : "Saved to your account."}{" "}
                Finish saves every current edit; draft sets stay excluded from
                progress.
              </p>
              <div className="button-row">
                <button onClick={() => void persist(active)}>
                  Save workout edits
                </button>
                <button
                  className="primary"
                  onClick={() => void persist(active, true)}
                >
                  Finish workout
                </button>
                <button onClick={() => void discard()}>Discard workout</button>
              </div>
            </section>
          </>
        )}
      </fieldset>
      {busy && <p role="status">Saving your workout…</p>}
      <section className="card workout-history">
        <h2>Recent workouts</h2>
        <p className="fine">
          Latest 20 sessions · expand to view completed sets
        </p>
        {!history.length ? (
          <p>No completed workouts yet.</p>
        ) : (
          history.map((w) => (
            <details key={w.id} className="history-detail">
              <summary>
                {w.name} · {new Date(w.started_at).toLocaleDateString()}
              </summary>
              {w.exercises.map((l) => (
                <div key={l.id}>
                  <strong>{exerciseName(l.exercise_id)}</strong>
                  <ul>
                    {l.sets
                      .filter((s) => s.completed_at)
                      .map((s, i) => (
                        <li key={s.id}>
                          Set {i + 1}: {summary(s, l.exercise_id)} · {s.kind}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </details>
          ))
        )}
      </section>
    </>
  );
}
