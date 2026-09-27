import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { kgPerLb } from "../lib/workout";
export function BodyweightEntry() {
  const request = useRef<{ payload: string; id: string } | null>(null);
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState("kg");
  const [when, setWhen] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<{
    weight_kg: number;
    measured_at: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (supabase)
      void supabase
        .from("body_metrics")
        .select("weight_kg,measured_at")
        .not("weight_kg", "is", null)
        .order("measured_at", { ascending: false })
        .limit(1)
        .then(({ data, error }) => {
          if (active) {
            setLatest(data?.[0] ?? null);
            if (error) setMessage("Unable to load your latest measurement.");
          }
        });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    if (!supabase || busy) return;
    const kg = Number(weight) * (unit === "lb" ? kgPerLb : 1);
    const time = new Date(when);
    if (
      !weight ||
      !Number.isFinite(kg) ||
      kg <= 0 ||
      kg > 1000 ||
      !Number.isFinite(time.getTime()) ||
      time.getTime() > Date.now()
    ) {
      setMessage(
        "Enter a positive weight and a measurement time that is not in the future.",
      );
      return;
    }
    setBusy(true);
    try {
      const row = { weight_kg: kg, measured_at: time.toISOString() };
      const payload = JSON.stringify(row);
      if (request.current?.payload !== payload)
        request.current = { payload, id: crypto.randomUUID() };
      const { error } = await supabase
        .from("body_metrics")
        .upsert({ ...row, id: request.current.id }, { onConflict: "id" });
      if (error) throw error;
      request.current = null;
      setLatest(row);
      setMessage("Bodyweight saved. Reopen Progress to refresh your ratios.");
      setWeight("");
    } catch {
      setMessage("Unable to save bodyweight. Your entry is still here.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Bodyweight</h2>
      <p>
        Relative strength uses a measurement taken on or before the workout,
        within 90 days.
      </p>
      {latest && (
        <p>
          Latest: {Number(latest.weight_kg).toFixed(1)} kg ·{" "}
          {new Date(latest.measured_at).toLocaleString()}
        </p>
      )}
      <fieldset className="logger-fieldset" disabled={busy || !supabase}>
        <div className="set-inputs">
          <label>
            Bodyweight
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label>
            Weight unit
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option>kg</option>
              <option>lb</option>
            </select>
          </label>
        </div>
        <label>
          Measured at
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>
        <button onClick={() => void save()}>Save bodyweight</button>
      </fieldset>
      <p role="status">{message}</p>
    </section>
  );
}
