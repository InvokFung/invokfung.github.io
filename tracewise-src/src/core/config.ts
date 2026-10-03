// Pipeline settings for the simulated checkout system. The browser and the
// evaluation both build their pipeline here, so the page shows exactly the
// configuration that was measured.

import { DEFAULT_SAMPLER, ERROR_DETECTOR, LATENCY_DETECTOR, type PipelineOptions } from "./pipeline";
import { PAGE_RULES } from "./slo";
import { ASYNC_FLOW, ENDPOINTS, SLO_TARGET } from "./topology";

const ROUTE_TO_FLOW = new Map(ENDPOINTS.map((e) => [e.route, e.id]));

export const FLOWS = [
  ...ENDPOINTS.map((e) => ({ id: e.id, root: "gateway", sloMs: e.sloMs, async: false })),
  { id: ASYNC_FLOW.id, root: ASYNC_FLOW.service, sloMs: ASYNC_FLOW.sloMs, async: true },
];

export function simPipelineOptions(overrides: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    decisionWaitMs: 5_000,
    orphanWaitMs: 60_000,
    sampler: DEFAULT_SAMPLER,
    storeLimit: 3_000,
    historyMin: 360,
    sloTarget: SLO_TARGET,
    burnRules: PAGE_RULES,
    flowOf: (root) => (root.service === "gateway" ? (ROUTE_TO_FLOW.get(root.name) ?? null) : null),
    asyncFlowOf: (s) => (s.service === ASYNC_FLOW.service ? ASYNC_FLOW.id : null),
    flows: FLOWS,
    warmupMin: 30,
    minLatencyRatio: 1.25,
    minErrorDelta: 0.005,
    closeAfterMin: 5,
    resolveAfterMin: 3,
    detectors: { latency: LATENCY_DETECTOR, errors: ERROR_DETECTOR },
    ...overrides,
  };
}
