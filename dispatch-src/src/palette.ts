// Colours shared by the canvas map and the timeline. Canvas cannot read CSS
// variables cheaply, so the values live here and in styles.css.

export const C = {
  bg: "#0b0c0e",
  panel: "#121417",
  street: "#2a2f37",
  arterial: "#414955",
  bridge: "#5d6673",
  river: "#0f2433",
  riverEdge: "#173447",
  text: "#ecebe6",
  soft: "#c9c8c2",
  muted: "#92949a",
  dim: "#63676e",
  gold: "#d4ff5a",
  bad: "#ff6b6b",
  warn: "#ffb547",
  done: "#3b4047",
};

/** One colour per technician: no red, amber or lime, which mean late, unassigned and moved. */
export const TECH_COLORS = ["#62b6ff", "#4fe3c1", "#c39bff", "#f06aa8", "#7bd88f", "#9fb4ff", "#5ad1e8", "#e8a6ff", "#f2d27a", "#8fd3c8", "#ff9ecb", "#b8c4ff"];

export const techColor = (k: number) => TECH_COLORS[k % TECH_COLORS.length];
