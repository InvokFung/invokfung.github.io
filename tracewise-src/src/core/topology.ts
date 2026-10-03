// The simulated checkout system: who calls whom, how long each piece of work
// takes, and the timeout and retry policy on every call.

export type NodeKind = "gateway" | "service" | "consumer" | "database" | "cache" | "external";

export interface ServiceDef {
  id: string;
  kind: NodeKind;
  /** Emits its own spans. Databases, the cache and the external provider do not: they are seen only through their callers' CLIENT spans. */
  instrumented: boolean;
  /** Concurrent requests it can handle; each holds a worker until it responds. */
  workers: number;
  version: string;
  /** Chance that any request fails on its own (a retryable 503 / UNAVAILABLE). */
  baseError: number;
  /** Background noise: occasional stop-the-world pauses (GC, noisy neighbours) with this chance and median length. */
  pause?: { p: number; ms: number };
  role: string;
}

const GC = { p: 0.004, ms: 35 };

export const SERVICES: ServiceDef[] = [
  { id: "gateway", kind: "gateway", instrumented: true, workers: 4, version: "3.12.0", baseError: 0.0002, pause: GC, role: "Edge API: authenticates and routes every request" },
  { id: "auth", kind: "service", instrumented: true, workers: 2, version: "2.4.1", baseError: 0.0003, role: "Verifies session tokens" },
  { id: "orders", kind: "service", instrumented: true, workers: 3, version: "1.30.2", baseError: 0.0003, pause: GC, role: "Orchestrates checkout" },
  { id: "cart", kind: "service", instrumented: true, workers: 2, version: "4.1.0", baseError: 0.0003, pause: GC, role: "Cart state" },
  { id: "payments", kind: "service", instrumented: true, workers: 3, version: "2.9.3", baseError: 0.0003, pause: GC, role: "Charges cards through the provider" },
  { id: "notifications", kind: "consumer", instrumented: true, workers: 2, version: "1.6.0", baseError: 0.0005, role: "Async consumer: order e-mails" },
  { id: "inventory", kind: "service", instrumented: true, workers: 2, version: "5.0.4", baseError: 0.0003, pause: GC, role: "Stock levels and reservations" },
  { id: "pricing", kind: "service", instrumented: true, workers: 2, version: "3.3.0", baseError: 0.0003, role: "Prices and quotes" },
  { id: "payment-provider", kind: "external", instrumented: false, workers: 12, version: "", baseError: 0.002, role: "Third-party card API" },
  { id: "postgres", kind: "database", instrumented: false, workers: 6, version: "", baseError: 0.0001, role: "Primary database" },
  { id: "redis", kind: "cache", instrumented: false, workers: 2, version: "", baseError: 0.00005, role: "Cache for sessions, carts and prices" },
];

export const SERVICE_IDS = SERVICES.map((s) => s.id);
export const serviceDef = (id: string) => SERVICES.find((s) => s.id === id);

export interface CallSpec {
  to: string;
  op: string;
  timeoutMs: number;
  retries: number;
  /** Made only with this probability. */
  p?: number;
  /** Called instead when this call fails, e.g. the database when the cache times out. */
  orElse?: CallSpec;
  /** Called after a successful call with probability p: a cache miss. */
  miss?: { p: number; call: CallSpec };
  /** A failure here does not fail the caller. */
  optional?: boolean;
}

export type Step =
  | { call: CallSpec }
  | { parallel: CallSpec[] }
  | { publish: { topic: string; to: string; op: string } }
  | { work: { name: string; ms: number; sigma: number } };

export interface OpDef {
  /** Median compute time in ms; the worker is busy for it. */
  ms: number;
  /** Log-space standard deviation of the compute time. */
  sigma: number;
  steps: Step[];
  /** Span attributes. */
  attrs?: Record<string, string | number>;
}

const pg = (op: string, timeoutMs = 400, retries = 0): CallSpec => ({ to: "postgres", op, timeoutMs, retries });
const cache = (op: string, onMiss: CallSpec, missP: number): CallSpec => ({
  to: "redis",
  op,
  timeoutMs: 40,
  retries: 0,
  orElse: onMiss,
  miss: { p: missP, call: onMiss },
});
const rpc = (to: string, op: string, timeoutMs: number, retries: number): CallSpec => ({ to, op, timeoutMs, retries });

/** Operations by service, then by name. */
export const OPS: Record<string, Record<string, OpDef>> = {
  gateway: {
    "GET /products": {
      ms: 1.2,
      sigma: 0.4,
      steps: [{ call: rpc("auth", "Verify", 250, 1) }, { parallel: [rpc("inventory", "ListStock", 400, 1), rpc("pricing", "ListPrices", 400, 1)] }],
    },
    "POST /cart/items": {
      ms: 1.4,
      sigma: 0.4,
      steps: [{ call: rpc("auth", "Verify", 250, 1) }, { call: rpc("cart", "AddItem", 700, 1) }],
    },
    "POST /checkout": {
      ms: 1.6,
      sigma: 0.4,
      steps: [{ call: rpc("auth", "Verify", 250, 1) }, { call: rpc("orders", "PlaceOrder", 4000, 0) }],
    },
  },
  auth: {
    Verify: { ms: 1.6, sigma: 0.35, steps: [{ call: cache("GET session", pg("SELECT sessions", 250), 0.06) }] },
  },
  cart: {
    AddItem: {
      ms: 2.2,
      sigma: 0.4,
      steps: [
        { call: rpc("inventory", "CheckStock", 300, 1) },
        { call: rpc("pricing", "Quote", 300, 1) },
        { call: { to: "redis", op: "SET cart", timeoutMs: 40, retries: 1, orElse: pg("UPSERT carts", 300) } },
      ],
    },
    GetCart: { ms: 1.5, sigma: 0.35, steps: [{ call: cache("GET cart", pg("SELECT carts", 300), 0.04) }] },
  },
  inventory: {
    ListStock: { ms: 2.4, sigma: 0.4, steps: [{ call: cache("MGET stock", pg("SELECT stock", 300), 0.08) }] },
    CheckStock: { ms: 1.8, sigma: 0.35, steps: [{ call: pg("SELECT stock", 300) }] },
    Reserve: { ms: 2.6, sigma: 0.35, steps: [{ call: pg("UPDATE stock", 400) }] },
  },
  pricing: {
    ListPrices: { ms: 2.0, sigma: 0.4, steps: [{ call: cache("MGET prices", pg("SELECT prices", 300), 0.05) }] },
    Quote: { ms: 1.8, sigma: 0.35, steps: [{ call: cache("GET prices", pg("SELECT prices", 300), 0.05) }] },
  },
  orders: {
    PlaceOrder: {
      ms: 2.8,
      sigma: 0.35,
      steps: [
        { call: rpc("cart", "GetCart", 300, 1) },
        { parallel: [rpc("inventory", "Reserve", 400, 1), rpc("pricing", "Quote", 300, 1)] },
        { call: rpc("payments", "Charge", 3000, 0) },
        { call: pg("INSERT orders", 500) },
        { publish: { topic: "order.created", to: "notifications", op: "order.created" } },
      ],
    },
  },
  payments: {
    Charge: {
      ms: 2.5,
      sigma: 0.35,
      steps: [{ call: { to: "payment-provider", op: "POST /v1/charges", timeoutMs: 1200, retries: 1 } }, { call: pg("INSERT payments", 400) }],
    },
  },
  notifications: {
    "order.created": {
      ms: 3,
      sigma: 0.4,
      steps: [
        { call: pg("SELECT orders", 400, 1) },
        { work: { name: "render email", ms: 6, sigma: 0.35 } },
        { call: { to: "redis", op: "SETNX sent", timeoutMs: 40, retries: 0, optional: true } },
      ],
    },
  },
  postgres: {
    "SELECT sessions": { ms: 0.9, sigma: 0.45, steps: [] },
    "SELECT carts": { ms: 1.1, sigma: 0.45, steps: [] },
    "UPSERT carts": { ms: 1.8, sigma: 0.45, steps: [] },
    "SELECT stock": { ms: 1.2, sigma: 0.45, steps: [] },
    "UPDATE stock": { ms: 2.2, sigma: 0.45, steps: [] },
    "SELECT prices": { ms: 1.0, sigma: 0.45, steps: [] },
    "INSERT orders": { ms: 2.4, sigma: 0.45, steps: [] },
    "INSERT payments": { ms: 2.0, sigma: 0.45, steps: [] },
    "SELECT orders": { ms: 1.0, sigma: 0.45, steps: [] },
  },
  redis: {
    "GET session": { ms: 0.2, sigma: 0.35, steps: [] },
    "GET cart": { ms: 0.2, sigma: 0.35, steps: [] },
    "SET cart": { ms: 0.25, sigma: 0.35, steps: [] },
    "MGET stock": { ms: 0.35, sigma: 0.35, steps: [] },
    "MGET prices": { ms: 0.35, sigma: 0.35, steps: [] },
    "GET prices": { ms: 0.2, sigma: 0.35, steps: [] },
    "SETNX sent": { ms: 0.2, sigma: 0.35, steps: [] },
  },
  "payment-provider": {
    "POST /v1/charges": { ms: 140, sigma: 0.3, steps: [] },
  },
};

export interface EndpointDef {
  id: string;
  /** The root span name: method and route on the gateway. */
  route: string;
  share: number;
  /** A request is "good" for the SLO if it succeeds within this many ms. */
  sloMs: number;
}

export const ENDPOINTS: EndpointDef[] = [
  { id: "browse", route: "GET /products", share: 0.5, sloMs: 250 },
  { id: "cart-add", route: "POST /cart/items", share: 0.3, sloMs: 300 },
  { id: "checkout", route: "POST /checkout", share: 0.2, sloMs: 1500 },
];

/** The asynchronous flow is monitored like an endpoint: delivery lag from publish to processed. */
export const ASYNC_FLOW = { id: "order-email", route: "order.created → notifications", service: "notifications", sloMs: 5000 };

/** Every monitored flow, as the pipeline names them. */
export const FLOW_IDS = [...ENDPOINTS.map((e) => e.id), ASYNC_FLOW.id];

/** Availability target shared by every SLO. */
export const SLO_TARGET = 0.995;

/** Mean arrival rate (requests per simulated second) and its daily swing. */
export const TRAFFIC = { meanRps: 12, amplitude: 0.5, peakHour: 14 };

/** Directed call edges implied by the operations, for layout and documentation. */
export function staticEdges(): { from: string; to: string; async: boolean }[] {
  const seen = new Map<string, { from: string; to: string; async: boolean }>();
  const add = (from: string, to: string, async = false) => {
    const k = `${from}>${to}`;
    if (!seen.has(k)) seen.set(k, { from, to, async });
  };
  const visit = (from: string, c: CallSpec) => {
    add(from, c.to);
    if (c.orElse) visit(from, c.orElse);
    if (c.miss) visit(from, c.miss.call);
  };
  for (const [svc, ops] of Object.entries(OPS))
    for (const op of Object.values(ops))
      for (const st of op.steps) {
        if ("call" in st) visit(svc, st.call);
        else if ("parallel" in st) st.parallel.forEach((c) => visit(svc, c));
        else if ("publish" in st) add(svc, st.publish.to, true);
      }
  return [...seen.values()];
}
