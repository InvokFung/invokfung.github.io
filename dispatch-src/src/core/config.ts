// Settings shared by the page, the evaluation and the tests, so the page runs
// with exactly the budgets that were measured.

/** ALNS iterations for the morning plan (no time limit, so it is deterministic). */
export const MORNING_ITERATIONS = 2500;
/** Re-plans: up to this many iterations, stopping early at the deadline. */
export const REPLAN_ITERATIONS = 500;
export const REPLAN_DEADLINE_MS = 50;
/** Removal size for ALNS: up to min(20, 25% of the jobs). */
export const Q_MAX = 20;
export const Q_FRAC = 0.25;

/** The day on the page. */
export const DEMO_SEED = "monday";
/** On the page the sick call comes at 09:00. */
export const DEMO_SICK_AT = 540;
