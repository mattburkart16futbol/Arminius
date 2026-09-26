import { readPages } from "../lib/paging";
import { useEffect, useMemo, useState } from "react";
import { Scale, UsersRound } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import type { AnalyticsDataset } from "../lib/analytics";
import {
  relativeStrengthSummary,
  type BodyMetric,
} from "../lib/relativeStrength";
import { supabase } from "../lib/supabase";

type UnitSystem = "metric" | "imperial";

type PercentileResult = {
  own_e1rm_kg: number | null;
  own_relative_e1rm: number | null;
  platform_absolute_percentile: number | null;
  platform_relative_percentile: number | null;
  platform_absolute_n: number;
  platform_relative_n: number;
  friend_absolute_percentile: number | null;
  friend_relative_percentile: number | null;
  friend_absolute_n: number;
  friend_relative_n: number;
};

const KG_PER_LB = 0.45359237;

function loadLabel(kg: number, unitSystem: UnitSystem) {
  const value = unitSystem === "imperial" ? kg / KG_PER_LB : kg;
  return `${value.toFixed(1)} ${unitSystem === "imperial" ? "lb" : "kg"}`;
}

function ordinal(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.max(0, Math.min(100, Math.round(value)));
  const mod100 = rounded % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : rounded % 10 === 1
        ? "st"
        : rounded % 10 === 2
          ? "nd"
          : rounded % 10 === 3
            ? "rd"
            : "th";
  return `${rounded}${suffix}`;
}

export function StrengthMetricsPanel({
  dataset,
  exerciseId,
  unitSystem,
}: {
  dataset: AnalyticsDataset;
  exerciseId: string;
  unitSystem: UnitSystem;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [percentiles, setPercentiles] = useState<PercentileResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!supabase || !userId || !exerciseId) return;

    let active = true;
    setLoading(true);
    setNote("");
    setPercentiles(null);
    setBodyMetrics([]);
    const client = supabase;
    const dates = dataset.workouts
      .map((w) => Date.parse(w.started_at))
      .filter(Number.isFinite);
    const since = new Date(
      Math.min(Date.now(), ...dates) - 90 * 86400000,
    ).toISOString();

    void Promise.all([
      readPages<BodyMetric>((from, to) =>
        client
          .from("body_metrics")
          .select("id,measured_at,weight_kg")
          .eq("user_id", userId)
          .not("weight_kg", "is", null)
          .gte("measured_at", since)
          .lte("measured_at", new Date().toISOString())
          .order("measured_at")
          .order("id")
          .range(from, to),
      ).then((data) => ({ data, error: null })),
      supabase.rpc("get_my_strength_percentiles", {
        p_exercise_id: exerciseId,
      }),
    ])
      .then(([bodyResult, percentileResult]) => {
        if (!active) return;
        if (bodyResult.error) throw bodyResult.error;
        setBodyMetrics((bodyResult.data ?? []) as BodyMetric[]);

        if (percentileResult.error) {
          setPercentiles(null);
          setNote(
            "Comparisons are unavailable. Check the database update and try reopening Progress.",
          );
        } else {
          const row = Array.isArray(percentileResult.data)
            ? percentileResult.data[0]
            : percentileResult.data;
          setPercentiles((row ?? null) as PercentileResult | null);
        }
      })
      .catch(() => {
        if (active) setNote("Unable to load relative-strength comparisons.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [exerciseId, userId, dataset]);

  const summary = useMemo(
    () => relativeStrengthSummary(dataset, bodyMetrics, exerciseId),
    [bodyMetrics, dataset, exerciseId],
  );

  return (
    <section className="card strength-comparison-card">
      <div className="spread">
        <h2>Relative strength</h2>
        <span className="badge">e1RM ÷ bodyweight</span>
      </div>

      {loading && <p className="fine">Refreshing comparisons…</p>}

      {!loading && summary.latest ? (
        <div className="strength-kpis">
          <div>
            <Scale size={17} />
            <span>Latest ratio</span>
            <strong>{summary.latest.ratio.toFixed(2)}× BW</strong>
            <small>
              {loadLabel(summary.latest.e1rmKg, unitSystem)} e1RM at{" "}
              {loadLabel(summary.latest.bodyweightKg, unitSystem)}
            </small>
          </div>
          <div>
            <span>Best ratio</span>
            <strong>{summary.best?.ratio.toFixed(2)}× BW</strong>
            <small>
              Bodyweight must be measured on/before the workout within 90 days.
            </small>
          </div>
          <div>
            <span>Change</span>
            <strong>
              {summary.changeFromFirst === null
                ? "—"
                : `${summary.changeFromFirst >= 0 ? "+" : ""}${(
                    summary.changeFromFirst * 100
                  ).toFixed(1)}%`}
            </strong>
            <small>First eligible session → latest eligible session</small>
          </div>
        </div>
      ) : (
        <div className="empty">
          <p>No bodyweight-relative metric yet.</p>
          <small>
            Log bodyweight and a weighted 1–12 rep set for this exercise.
          </small>
        </div>
      )}

      <div className="percentile-section">
        <div className="spread">
          <h3>
            <UsersRound size={17} /> Percentiles
          </h3>
          <span className="badge">Opt-in aggregate</span>
        </div>

        <div className="percentile-grid">
          <div>
            <span>Platform · relative</span>
            <strong>
              {ordinal(percentiles?.platform_relative_percentile ?? null)}
            </strong>
            <small>
              vs {percentiles?.platform_relative_n ?? 0} opted-in athletes
            </small>
          </div>
          <div>
            <span>Platform · absolute</span>
            <strong>
              {ordinal(percentiles?.platform_absolute_percentile ?? null)}
            </strong>
            <small>
              vs {percentiles?.platform_absolute_n ?? 0} opted-in athletes
            </small>
          </div>
          <div>
            <span>Friends · relative</span>
            <strong>
              {ordinal(percentiles?.friend_relative_percentile ?? null)}
            </strong>
            <small>
              vs {percentiles?.friend_relative_n ?? 0} opted-in friends
            </small>
          </div>
          <div>
            <span>Friends · absolute</span>
            <strong>
              {ordinal(percentiles?.friend_absolute_percentile ?? null)}
            </strong>
            <small>
              vs {percentiles?.friend_absolute_n ?? 0} opted-in friends
            </small>
          </div>
        </div>
      </div>

      {note && <p className="fine">{note}</p>}
      <p className="fine">
        Percentiles require at least five eligible peers and compare all-time
        bests; the ratios above use this page’s selected period. Ties receive
        half credit. These are self-reported comparisons, not independently
        verified achievements.
      </p>
    </section>
  );
}
