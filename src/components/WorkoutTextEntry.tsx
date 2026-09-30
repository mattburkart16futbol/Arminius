import { useEffect, useRef, useState } from "react";
import {
  parseWorkoutText,
  workoutTextDrafts,
  workoutNameChoices,
} from "../lib/workout-text";
import {
  displayWeight,
  exerciseName,
  weightLabel,
  type LiftEntry,
  type Unit,
} from "../lib/workout";

import { validateWorkoutAI } from "../lib/workout-ai";

export function WorkoutTextEntry({
  units,
  onAdd,
  remaining,
}: {
  units: Unit;
  onAdd?: (lifts: LiftEntry[]) => void;
  remaining: number;
}) {
  const [text, setText] = useState("");
  const [inputUnits, setInputUnits] = useState<Unit>(units);
  const [preview, setPreview] = useState<ReturnType<
    typeof parseWorkoutText
  > | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState("");
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiResult, setAiResult] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
  };
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const runAI = () => {
    stop();
    setPreview(null);
    setAiResult(true);
    setConfirmed(false);
    setBusy(true);
    setNotice("Starting local AI…");
    const instance = new Worker(
      new URL("../lib/workout-ai.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.onmessage = (event) => {
      if (worker.current !== instance) return;
      if (event.data.status === "complete") {
        setPreview(validateWorkoutAI(event.data.raw, inputUnits));
        setNotice(
          "Compare every exercise, weight, rep and set with your original notes. AI can misread or omit details.",
        );
        stop();
      } else if (event.data.status === "error") {
        setNotice(event.data.message);
        stop();
      } else setNotice(event.data.message);
    };
    instance.onerror = () => {
      setNotice("Local AI could not start. Use standard review instead.");
      stop();
    };
    timer.current = setTimeout(() => {
      setNotice(
        "Local AI took too long. Try fewer exercises or standard review.",
      );
      stop();
    }, 300000);
    instance.postMessage({ text, units: inputUnits });
  };
  return (
    <section className="card workout-text-entry">
      <h2>Type your workout</h2>
      <p>
        Use one exercise per line. Review the result, then add draft sets.
        Nothing is marked complete automatically.
      </p>
      <label>
        Units for weights without a unit
        <select
          value={inputUnits}
          onChange={(e) => {
            stop();
            setInputUnits(e.target.value as Unit);
            setPreview(null);
            setConfirmed(false);
          }}
        >
          <option value="metric">kg</option>
          <option value="imperial">lb</option>
        </select>
      </label>
      <label>
        Workout text
        <textarea
          aria-label="Workout text"
          rows={5}
          maxLength={6000}
          value={text}
          placeholder={
            "Bench press: 135 lb x 10, 155 lb x 8\nDumbbell shoulder press: 3 sets of 10 at 40 lb"
          }
          onChange={(e) => {
            stop();
            setText(e.target.value);
            setAiResult(false);
            setConfirmed(false);
            setChoices({});
            setPreview(null);
            setNotice("");
          }}
        />
      </label>
      <p className="fine">
        Dumbbell weights mean each dumbbell. For bodyweight exercises, enter
        added weight or “bodyweight x 10”. Standard review handles shorthand.
        The optional experimental AI reads natural phrasing on your device.
        Neither option uses a paid API.
      </p>
      <button
        type="button"
        onClick={() => {
          stop();
          setAiResult(false);
          setPreview(parseWorkoutText(text, inputUnits, choices));
          setNotice("");
        }}
      >
        Review workout text
      </button>
      <details>
        <summary>Try free local AI (experimental)</summary>
        <p>
          First use downloads roughly 1 GB from Hugging Face and may take
          several minutes. Your workout text stays on this device. Browser
          storage may cache the model; clearing it requires another download.
          Performance varies, especially on phones. No web search or coaching is
          included.
        </p>
        <p>
          Use up to 1,500 characters for this trial. Review carefully: a small
          local model can choose the wrong variation or miss details.
        </p>
        <button
          type="button"
          disabled={busy || !text.trim() || text.length > 1500}
          onClick={runAI}
        >
          Download / run local AI
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              stop();
              setNotice("Local AI stopped. Your notes are unchanged.");
            }}
          >
            Cancel local AI
          </button>
        )}
      </details>
      {preview &&
        !aiResult &&
        workoutNameChoices(text).map(({ index, name, options }) => (
          <label key={index}>
            Choose exercise for line {index + 1}: {name}
            <select
              aria-label={`Exercise match for line ${index + 1}`}
              value={choices[index] ?? ""}
              onChange={(e) => {
                const next = { ...choices, [index]: e.target.value };
                setChoices(next);
                setPreview(parseWorkoutText(text, inputUnits, next));
              }}
            >
              <option value="">Choose the intended movement</option>
              {options.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="fine">
              Closest word matches appear first. Choose only an equivalent
              movement; if none fits, keep it unselected.
            </span>
          </label>
        ))}
      {preview && (
        <div aria-live="polite">
          {preview.errors.length > 0 ? (
            <ul>
              {preview.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : (
            <>
              <h3>Review draft sets</h3>
              {preview.lifts.map((lift, index) => (
                <div key={index}>
                  <strong>{exerciseName(lift.exercise_id)}</strong>
                  <p>
                    {weightLabel(lift.exercise_id)} ·{" "}
                    {inputUnits === "imperial" ? "lb" : "kg"}
                  </p>
                  <ol>
                    {lift.sets.map((set, i) => (
                      <li key={i}>
                        {displayWeight(set.weight_kg, inputUnits)}{" "}
                        {inputUnits === "imperial" ? "lb" : "kg"} × {set.reps}{" "}
                        reps
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              {preview.lifts.length > remaining && (
                <p>
                  There is room for {remaining} more exercise entries. Shorten
                  the text before adding.
                </p>
              )}
              {!onAdd && <p>Start a workout to add these sets.</p>}
              {aiResult && (
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  I checked all exercises, weights, reps and sets against my
                  notes.
                </label>
              )}
              <button
                type="button"
                className="primary"
                disabled={
                  !onAdd ||
                  preview.lifts.length > remaining ||
                  (aiResult && !confirmed)
                }
                onClick={() => {
                  if (
                    !onAdd ||
                    preview.lifts.length > remaining ||
                    (aiResult && !confirmed)
                  )
                    return;
                  onAdd(workoutTextDrafts(preview.lifts));
                  setPreview(null);
                  setText("");
                  setChoices({});
                  setNotice(
                    "Draft sets added. Edit them below, then mark sets complete and save when ready.",
                  );
                }}
              >
                Add draft sets to workout
              </button>
            </>
          )}
        </div>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
