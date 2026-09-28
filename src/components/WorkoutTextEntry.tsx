import { useState } from "react";
import { parseWorkoutText, workoutTextDrafts } from "../lib/workout-text";
import { displayWeight, exerciseName, weightLabel, type LiftEntry, type Unit } from "../lib/workout";

export function WorkoutTextEntry({ units, onAdd, remaining }: {
  units: Unit; onAdd?: (lifts: LiftEntry[]) => void; remaining: number;
}) {
  const [text, setText] = useState("");
  const [inputUnits, setInputUnits] = useState<Unit>(units);
  const [preview, setPreview] = useState<ReturnType<typeof parseWorkoutText> | null>(null);
  const [notice, setNotice] = useState("");
  return <section className="card workout-text-entry">
    <h2>Type your workout</h2>
    <p>Use one exercise per line. Review the result, then add draft sets. Nothing is marked complete automatically.</p>
    <label>Units for weights without a unit
      <select value={inputUnits} onChange={(e) => { setInputUnits(e.target.value as Unit); setPreview(null); }}>
        <option value="metric">kg</option><option value="imperial">lb</option>
      </select>
    </label>
    <label>Workout text
      <textarea aria-label="Workout text" rows={5} maxLength={6000} value={text}
        placeholder={"Bench press: 135 lb x 10, 155 lb x 8\nDumbbell shoulder press: 3 sets of 10 at 40 lb"}
        onChange={(e) => { setText(e.target.value); setPreview(null); setNotice(""); }} />
    </label>
    <p className="fine">Dumbbell weights mean each dumbbell. For bodyweight exercises, enter added weight or “bodyweight x 10”. This free shorthand helper runs on your device; conversational AI and web search are not connected.</p>
    <button type="button" onClick={() => { setPreview(parseWorkoutText(text, inputUnits)); setNotice(""); }}>Review workout text</button>
    {preview && <div aria-live="polite">
      {preview.errors.length > 0 ? <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <>
        <h3>Review draft sets</h3>
        {preview.lifts.map((lift, index) => <div key={index}>
          <strong>{exerciseName(lift.exercise_id)}</strong>
          <p>{weightLabel(lift.exercise_id)} · {inputUnits === "imperial" ? "lb" : "kg"}</p>
          <ol>{lift.sets.map((set, i) => <li key={i}>{displayWeight(set.weight_kg, inputUnits)} {inputUnits === "imperial" ? "lb" : "kg"} × {set.reps} reps</li>)}</ol>
        </div>)}
        {preview.lifts.length > remaining && <p>There is room for {remaining} more exercise entries. Shorten the text before adding.</p>}
        {!onAdd && <p>Start a workout to add these sets.</p>}
        <button type="button" className="primary" disabled={!onAdd || preview.lifts.length > remaining} onClick={() => {
          if (!onAdd || preview.lifts.length > remaining) return;
          onAdd(workoutTextDrafts(preview.lifts)); setPreview(null); setText("");
          setNotice("Draft sets added. Edit them below, then mark sets complete and save when ready.");
        }}>Add draft sets to workout</button>
      </>}
    </div>}
    <p role="status">{notice}</p>
  </section>;
}
