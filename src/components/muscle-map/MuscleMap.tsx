import { useId } from "react";
import type { MuscleLoads } from "./model";
import { regions, type View } from "./regions";
export function MuscleMap({ view, loads }: { view: View; loads: MuscleLoads }) {
  const titleId = useId();
  return (
    <svg
      className="muscle-map"
      viewBox="0 0 180 305"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {view === "front" ? "Front" : "Back"} muscle involvement
      </title>
      <g fill="#e4e7e1" stroke="#c7cec6" strokeWidth="1.5">
        <circle cx="90" cy="30" r="19" />
        <path d="M80 49 L100 49 L111 59 Q133 55 141 80 L159 165 L148 173 L126 127 L121 93 L114 147 L121 180 L117 281 L121 296 L100 296 L90 204 L80 296 L59 296 L63 281 L59 180 L66 147 L59 93 L54 127 L32 173 L21 165 L39 80 Q47 55 69 59Z" />
      </g>
      {regions[view].map(({ muscle, d }) => (
        <path
          key={muscle}
          data-muscle={muscle}
          d={d}
          fill={
            (loads[muscle] ?? 0) >= 1
              ? "#bce278"
              : (loads[muscle] ?? 0) > 0
                ? "#789c87"
                : "#d4dcd2"
          }
          stroke="#fff"
          strokeWidth="1.5"
        >
          <title>
            {muscle.replaceAll("_", " ")}:{" "}
            {(loads[muscle] ?? 0) >= 1
              ? "primary"
              : (loads[muscle] ?? 0) > 0
                ? "supporting"
                : "not selected"}
          </title>
        </path>
      ))}
    </svg>
  );
}
