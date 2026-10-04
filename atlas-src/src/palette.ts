// One hue per category, spread around the wheel and tuned to read on the
// near-black background. Indexed by category order in meta.json.
const HUES = [
  "#7c8cff", "#22d3ee", "#f59e0b", "#f472b6", "#34d399", "#a78bfa",
  "#fb7185", "#60a5fa", "#facc15", "#2dd4bf", "#f97316", "#c084fc",
  "#4ade80", "#38bdf8", "#e879f9", "#fbbf24", "#94a3b8", "#fda4af",
];

export const categoryColor = (i: number) => HUES[i % HUES.length];
