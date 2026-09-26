import type { MuscleId } from "./model";
export type View = "front" | "back";
type Region = { muscle: MuscleId; d: string };
// Symmetric regions are single paths so muscle IDs remain unique within a view.
export const regions: Record<View, Region[]> = {
  front: [
    {
      muscle: "shoulders",
      d: "M67 62 Q45 57 42 85 L60 91 L69 75Z M113 62 Q135 57 138 85 L120 91 L111 75Z",
    },
    {
      muscle: "chest",
      d: "M70 65 L88 69 L88 96 Q72 101 62 87Z M110 65 L92 69 L92 96 Q108 101 118 87Z",
    },
    {
      muscle: "biceps",
      d: "M43 91 L57 95 L51 126 L36 121Z M137 91 L123 95 L129 126 L144 121Z",
    },
    {
      muscle: "forearms",
      d: "M35 127 L49 131 L38 165 L27 161Z M145 127 L131 131 L142 165 L153 161Z",
    },
    { muscle: "core", d: "M66 102 L114 102 L109 147 L91 158 L71 147Z" },
    {
      muscle: "quads",
      d: "M69 162 L87 170 L84 222 L64 222Z M111 162 L93 170 L96 222 L116 222Z",
    },
    {
      muscle: "calves",
      d: "M64 232 L83 232 L78 277 L66 277Z M116 232 L97 232 L102 277 L114 277Z",
    },
  ],
  back: [
    {
      muscle: "shoulders",
      d: "M67 62 Q45 57 42 85 L60 91 L69 75Z M113 62 Q135 57 138 85 L120 91 L111 75Z",
    },
    { muscle: "upper_back", d: "M70 64 L90 58 L110 64 L106 97 L74 97Z" },
    {
      muscle: "lats",
      d: "M63 92 L87 102 L85 133 L69 120Z M117 92 L93 102 L95 133 L111 120Z",
    },
    { muscle: "lower_back", d: "M75 129 L105 129 L108 150 L72 150Z" },
    {
      muscle: "triceps",
      d: "M43 91 L57 95 L51 126 L36 121Z M137 91 L123 95 L129 126 L144 121Z",
    },
    {
      muscle: "forearms",
      d: "M35 127 L49 131 L38 165 L27 161Z M145 127 L131 131 L142 165 L153 161Z",
    },
    {
      muscle: "glutes",
      d: "M71 155 L88 155 L88 184 L66 184Z M109 155 L92 155 L92 184 L114 184Z",
    },
    {
      muscle: "hamstrings",
      d: "M66 190 L86 190 L83 227 L64 227Z M114 190 L94 190 L97 227 L116 227Z",
    },
    {
      muscle: "calves",
      d: "M64 233 L83 233 L78 277 L66 277Z M116 233 L97 233 L102 277 L114 277Z",
    },
  ],
};
