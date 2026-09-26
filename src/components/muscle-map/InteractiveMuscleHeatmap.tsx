import { useId, type KeyboardEvent } from "react";
import type { MuscleId } from "./model";
import { regions, type View } from "./regions";

export type HeatmapLoads = Partial<Record<MuscleId, number>>;

function intensityStyle(intensity: number, glowId: string) {
  const value = Math.max(0, Math.min(1, intensity));
  if (value <= 0) {
    return {
      fill: "#dde1dc",
      stroke: "#ffffff",
      filter: "none",
    };
  }

  // Yellow at low workload, orange in the middle, bright red at high workload.
  // HSL keeps interpolation deterministic without another dependency.
  const hue = 52 - value * 52;
  const lightness = 62 - value * 12;
  return {
    fill: `hsl(${hue} 92% ${lightness}%)`,
    stroke: value > 0.72 ? "#7b1e12" : "#ffffff",
    filter: value > 0.82 ? `url(#${glowId})` : "none",
  };
}

export function InteractiveMuscleHeatmap({
  view,
  intensities,
  selectedMuscle,
  onSelectMuscle,
}: {
  view: View;
  intensities: HeatmapLoads;
  selectedMuscle?: MuscleId | null;
  onSelectMuscle?: (muscle: MuscleId) => void;
}) {
  const titleId = useId();
  const glowId = useId().replaceAll(":", "");
  const descriptionId = useId();

  function handleKeyDown(
    event: KeyboardEvent<SVGPathElement>,
    muscle: MuscleId,
  ) {
    if (!onSelectMuscle) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectMuscle(muscle);
    }
  }

  return (
    <svg
      className="muscle-map interactive-muscle-map"
      viewBox="0 0 180 305"
      role={onSelectMuscle ? "group" : "img"}
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>
        {view === "front" ? "Front" : "Back"} training workload heatmap
      </title>
      <desc id={descriptionId}>
        Muscles progress from neutral to yellow, orange, and red as mapped
        training workload increases. Select a highlighted muscle for details.
      </desc>

      <defs>
        <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        className="anatomy-silhouette"
        fill="#eceeea"
        stroke="#bfc7bf"
        strokeWidth="1.2"
      >
        <circle cx="90" cy="30" r="19" />
        <path d="M80 49 L100 49 L111 59 Q133 55 141 80 L159 165 L148 173 L126 127 L121 93 L114 147 L121 180 L117 281 L121 296 L100 296 L90 204 L80 296 L59 296 L63 281 L59 180 L66 147 L59 93 L54 127 L32 173 L21 165 L39 80 Q47 55 69 59Z" />
      </g>

      {regions[view].map(({ muscle, d }) => {
        const intensity = Math.max(0, Math.min(1, intensities[muscle] ?? 0));
        const selected = selectedMuscle === muscle;
        const style = intensityStyle(intensity, glowId);
        const interactive = Boolean(onSelectMuscle);

        return (
          <path
            key={muscle}
            className={[
              "heatmap-region",
              intensity > 0 ? "trained" : "",
              selected ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-muscle={muscle}
            d={d}
            fill={style.fill}
            stroke={selected ? "#202a22" : style.stroke}
            strokeWidth={selected ? 3 : 1.4}
            filter={style.filter}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? selected : undefined}
            aria-label={
              interactive
                ? `${muscle.replaceAll("_", " ")}, ${Math.round(intensity * 100)} percent relative workload`
                : undefined
            }
            onClick={interactive ? () => onSelectMuscle?.(muscle) : undefined}
            onKeyDown={
              interactive ? (event) => handleKeyDown(event, muscle) : undefined
            }
          >
            <title>
              {muscle.replaceAll("_", " ")}:{" "}
              {intensity <= 0
                ? "no mapped workload"
                : `${Math.round(intensity * 100)}% relative workload`}
            </title>
          </path>
        );
      })}
    </svg>
  );
}
