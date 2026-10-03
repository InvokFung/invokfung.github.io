// A seeded discrete-event simulation of the checkout system in topology.ts.
//
// Every service is a queue in front of c workers. A request holds a worker
// for as long as it is being handled, including while it waits on its own
// downstream calls (thread-per-request), so a slow dependency can exhaust
// its callers' pools: the cascading failure that makes root-cause analysis
// hard. Compute times are lognormal, arrivals are a Poisson process whose
// rate follows the time of day, and every call has a timeout and a retry
// policy. Faults can be injected into any service. Spans are emitted as they
// end, the way an OpenTelemetry SDK exports them.

import { EventHeap } from "./heap";
import { Rng } from "./rng";
import { ENDPOINTS, OPS, SERVICES, TRAFFIC, type CallSpec, type OpDef, type ServiceDef } from "./topology";
import { Kind, Status, type AttrValue, type Span, type SpanKind } from "./types";

export type FaultKind = "latency" | "errors" | "capacity" | "timeout" | "deploy";
export const FAULT_KINDS: FaultKind[] = ["latency", "errors", "capacity", "timeout", "deploy"];

/**
 * What a fault does to a service, by kind:
 * - latency:  adds `magnitude` ms (median) to every request's compute time.
 * - errors:   fails a fraction `magnitude` of requests.
 * - capacity: removes a fraction `magnitude` of its workers (slowing the rest when fewer than one would remain).
 * - timeout:  a fraction `magnitude` of requests hang until the caller's timeout cancels them.
 * - deploy:   rolls out a new version over `rampMs`; it computes `magnitude`x slower and fails 1.5% x (magnitude - 1) of requests.
 */
export interface FaultSpec {
  service: string;
  kind: FaultKind;
  magnitude: number;
  /** Simulated ms; defaults to now. */
  startMs?: number;
  durationMs?: number;
  rampMs?: number;
}

export interface Fault extends FaultSpec {
  id: number;
  startMs: number;
  endMs: number;
  rampMs: number;
  version?: string;
}

export interface SimOptions {
  seed: number;
  /** Hour of day at t = 0, for the daily traffic curve. */
  startHour?: number;
  /** Multiplies the arrival rate. */
  rateScale?: number;
  onSpan: (s: Span) => void;
}

interface Ev {
  t: number;
  seq: number;
  fn: () => void;
}

export interface Station {
  def: ServiceDef;
  workers: number;
  /** Compute-time multiplier when capacity is cut below one worker. */
  slow: number;
  busy: number;
  queue: Job[];
  head: number;
  arrivals: number;
  failures: number;
}

interface Job {
  cancelled: boolean;
  run(): void;
  reject(): void;
}

interface Res {
  ok: boolean;
  code: string;
  retryable: boolean;
}

interface Effects {
  addMs: number;
  errP: number;
  hang: boolean;
  mul: number;
  version: string;
}

interface Responder {
  onResponse(r: Res): void;
}

const OK: Res = { ok: true, code: "OK", retryable: false };
const fail = (code: string, retryable: boolean): Res => ({ ok: false, code, retryable });
const TIMEOUT = fail("DEADLINE_EXCEEDED", true);
const CANCELLED = fail("CANCELLED", false);
const OVERLOADED = fail("RESOURCE_EXHAUSTED", true);
const UNAVAILABLE = fail("UNAVAILABLE", true);
const INTERNAL = fail("INTERNAL", false);

const HTTP_STATUS: Record<string, number> = { OK: 200, DEADLINE_EXCEEDED: 504, CANCELLED: 499, RESOURCE_EXHAUSTED: 503, UNAVAILABLE: 503, INTERNAL: 500 };
const GRPC_STATUS: Record<string, number> = { OK: 0, CANCELLED: 1, DEADLINE_EXCEEDED: 4, RESOURCE_EXHAUSTED: 8, INTERNAL: 13, UNAVAILABLE: 14 };

/** A queue longer than this many requests per worker sheds load. */
const MAX_QUEUE_PER_WORKER = 60;
/** End users give up on a request after this long. */
export const CLIENT_TIMEOUT_MS = 10_000;
/** A consumer abandons a message after this long and it is redelivered. */
const CONSUMER_DEADLINE_MS = 2_000;
const MAX_REDELIVERIES = 2;

const ns = (ms: number) => Math.round(ms * 1e6);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export class Simulator {
  readonly rng: Rng;
  now = 0;
  readonly startHour: number;
  readonly rateScale: number;
  spansEmitted = 0;
  requests = 0;
  readonly stations = new Map<string, Station>();
  readonly faults: Fault[] = [];
  private heap = new EventHeap<Ev>();
  private seq = 0;
  private emit: (s: Span) => void;
  private nextFaultId = 1;
  private cumShares: number[];
  private noEffects = new Map<string, Effects>();

  constructor(opts: SimOptions) {
    this.rng = new Rng(opts.seed);
    this.startHour = opts.startHour ?? 10;
    this.rateScale = opts.rateScale ?? 1;
    this.emit = opts.onSpan;
    for (const def of SERVICES) {
      this.stations.set(def.id, { def, workers: def.workers, slow: 1, busy: 0, queue: [], head: 0, arrivals: 0, failures: 0 });
      this.noEffects.set(def.id, { addMs: 0, errP: 0, hang: false, mul: 1, version: def.version });
    }
    let acc = 0;
    this.cumShares = ENDPOINTS.map((e) => (acc += e.share));
    this.scheduleArrival();
  }

  // ------------------------------------------------------------ clock

  /** Hour of day (fractional) at simulated time t. */
  hourAt(t = this.now): number {
    return (((this.startHour + t / 3_600_000) % 24) + 24) % 24;
  }

  /** Arrival rate in requests per simulated second. */
  rate(t = this.now): number {
    const h = this.hourAt(t);
    return TRAFFIC.meanRps * this.rateScale * (1 + TRAFFIC.amplitude * Math.cos((2 * Math.PI * (h - TRAFFIC.peakHour)) / 24));
  }

  /** Schedule fn at time t (internal). */
  at(t: number, fn: () => void): void {
    this.heap.push({ t, seq: this.seq++, fn });
  }

  /** Process every event up to time t (ms). */
  runUntil(t: number): void {
    const h = this.heap;
    for (;;) {
      const e = h.peek();
      if (!e || e.t > t) break;
      h.pop();
      this.now = e.t;
      e.fn();
    }
    this.now = t;
  }

  // ------------------------------------------------------------ faults

  inject(spec: FaultSpec): Fault {
    if (!this.stations.has(spec.service)) throw new Error(`unknown service ${spec.service}`);
    const startMs = Math.max(this.now, spec.startMs ?? this.now);
    const f: Fault = {
      ...spec,
      id: this.nextFaultId++,
      startMs,
      endMs: spec.durationMs !== undefined ? startMs + spec.durationMs : Infinity,
      rampMs: spec.rampMs ?? (spec.kind === "deploy" ? 120_000 : 0),
    };
    if (f.kind === "deploy") f.version = bumpVersion(this.stations.get(f.service)!.def.version || "1.0.0");
    this.faults.push(f);
    this.at(startMs, () => this.refreshCapacity(f.service));
    if (Number.isFinite(f.endMs)) this.at(f.endMs, () => this.refreshCapacity(f.service));
    return f;
  }

  /** End one fault, or all of them. */
  clear(id?: number): void {
    for (const f of this.faults) {
      if ((id === undefined || f.id === id) && f.endMs > this.now) {
        f.endMs = this.now;
        if (f.startMs > this.now) f.startMs = this.now;
        this.refreshCapacity(f.service);
      }
    }
  }

  activeFaults(t = this.now): Fault[] {
    return this.faults.filter((f) => f.startMs <= t && t < f.endMs);
  }

  private refreshCapacity(service: string): void {
    const st = this.stations.get(service)!;
    let keep = 1;
    for (const f of this.activeFaults()) if (f.service === service && f.kind === "capacity") keep *= 1 - Math.min(0.99, Math.max(0, f.magnitude));
    const eff = st.def.workers * keep;
    st.workers = Math.max(1, Math.round(eff));
    st.slow = Math.max(1, st.workers / eff);
    this.drain(st);
  }

  /** Per-request effects of the faults active on a service right now. */
  effects(st: Station): Effects {
    let fx: Effects | null = null;
    for (const f of this.faults) {
      if (f.service !== st.def.id || this.now < f.startMs || this.now >= f.endMs || f.kind === "capacity") continue;
      fx ??= { addMs: 0, errP: 0, hang: false, mul: 1, version: st.def.version };
      if (f.kind === "latency") fx.addMs += this.rng.lognormal(f.magnitude, 0.25);
      else if (f.kind === "errors") fx.errP = 1 - (1 - fx.errP) * (1 - f.magnitude);
      else if (f.kind === "timeout") fx.hang ||= this.rng.chance(f.magnitude);
      else if (f.kind === "deploy") {
        const share = f.rampMs > 0 ? Math.min(1, (this.now - f.startMs) / f.rampMs) : 1;
        if (this.rng.chance(share)) {
          fx.version = f.version ?? fx.version;
          fx.mul *= f.magnitude;
          fx.errP = 1 - (1 - fx.errP) * (1 - Math.min(0.5, 0.015 * (f.magnitude - 1)));
        }
      }
    }
    return fx ?? this.noEffects.get(st.def.id)!;
  }

  // ------------------------------------------------------------ queues

  acquire(st: Station, job: Job): void {
    st.arrivals++;
    if (st.busy < st.workers) {
      st.busy++;
      job.run();
    } else if (st.queue.length - st.head >= MAX_QUEUE_PER_WORKER * st.def.workers) job.reject();
    else st.queue.push(job);
  }

  release(st: Station): void {
    st.busy--;
    this.drain(st);
  }

  private drain(st: Station): void {
    while (st.busy < st.workers && st.head < st.queue.length) {
      const job = st.queue[st.head++];
      if (job.cancelled) continue;
      st.busy++;
      job.run();
    }
    if (st.head > 256 && st.head * 2 > st.queue.length) {
      st.queue = st.queue.slice(st.head);
      st.head = 0;
    }
  }

  queueLength(id: string): number {
    const st = this.stations.get(id)!;
    let n = 0;
    for (let i = st.head; i < st.queue.length; i++) if (!st.queue[i].cancelled) n++;
    return n;
  }

  // ------------------------------------------------------------ spans

  span(traceId: string, parentSpanId: string, name: string, kind: SpanKind, service: string, version: string, attributes: Record<string, AttrValue>): Span {
    return {
      traceId,
      spanId: this.rng.hexId(8),
      parentSpanId,
      name,
      kind,
      service,
      version: version || undefined,
      startNs: ns(this.now),
      endNs: 0,
      status: Status.UNSET,
      attributes,
    };
  }

  end(s: Span, r: Res): void {
    s.endNs = ns(this.now);
    if (!r.ok) {
      s.status = Status.ERROR;
      s.statusMessage = r.code;
    }
    this.spansEmitted++;
    this.emit(s);
  }

  netDelay(to: string): number {
    return to === "payment-provider" ? this.rng.lognormal(12, 0.3) : this.rng.lognormal(0.2, 0.4);
  }

  // ------------------------------------------------------------ traffic

  private scheduleArrival(): void {
    const peak = TRAFFIC.meanRps * this.rateScale * (1 + TRAFFIC.amplitude);
    this.at(this.now + this.rng.exp(peak) * 1000, () => {
      // Thinning: a homogeneous process at the peak rate, kept at rate(t) / peak.
      if (this.rng.float() * peak < this.rate()) this.newRequest();
      this.scheduleArrival();
    });
  }

  private newRequest(): void {
    const u = this.rng.float();
    let i = 0;
    while (i < this.cumShares.length - 1 && u >= this.cumShares[i]) i++;
    this.requests++;
    new EndUser(this, ENDPOINTS[i].route, this.rng.hexId(16)).start();
  }

  /** A synchronous request arriving at a service; returns its handler. */
  serve(sid: string, opName: string, traceId: string, parentSpanId: string, client: Responder): ServerReq {
    const req = new ServerReq(this, this.stations.get(sid)!, opName, traceId, parentSpanId, client);
    this.acquire(req.st, req);
    return req;
  }

  /** A message reaching its consumer group. */
  consume(sid: string, opName: string, topic: string, traceId: string, producerId: string, enqueuedNs: number, delivery: number): void {
    const req = new ConsumerReq(this, this.stations.get(sid)!, opName, topic, traceId, producerId, enqueuedNs, delivery);
    this.acquire(req.st, req);
  }
}

/** The uninstrumented end-user client: no span, but it gives up after CLIENT_TIMEOUT_MS. */
class EndUser implements Responder {
  private done = false;
  private req: ServerReq | null = null;
  constructor(
    private sim: Simulator,
    private route: string,
    private traceId: string,
  ) {}
  start(): void {
    this.sim.at(this.sim.now + CLIENT_TIMEOUT_MS, () => {
      if (!this.done) this.req?.cancel();
    });
    this.req = this.sim.serve("gateway", this.route, this.traceId, "", this);
  }
  onResponse(): void {
    this.done = true;
  }
}

/** Work a service does for one request or message: compute, then its steps. */
abstract class Handler implements Job {
  cancelled = false;
  finished = false;
  holding = false;
  calls: ClientCall[] = [];
  version: string;
  /** Span id that this handler's child spans hang off. */
  parentId = "";
  private i = 0;
  private pending = 0;
  private failed = false;

  constructor(
    readonly sim: Simulator,
    readonly st: Station,
    readonly op: OpDef,
    readonly traceId: string,
  ) {
    this.version = st.def.version;
  }

  abstract run(): void;
  abstract reject(): void;
  abstract finish(r: Res): void;

  compute(fx: Effects): void {
    const rng = this.sim.rng;
    let ms = rng.lognormal(this.op.ms, this.op.sigma) * this.st.slow * fx.mul + fx.addMs;
    const pause = this.st.def.pause;
    if (pause && rng.chance(pause.p)) ms += rng.lognormal(pause.ms, 0.5);
    this.sim.at(this.sim.now + ms, () => this.afterCompute(fx.errP));
  }

  private afterCompute(errP: number): void {
    if (this.cancelled) return;
    const rng = this.sim.rng;
    if (errP > 0 && rng.chance(errP)) return this.finish(this.st.def.instrumented ? INTERNAL : UNAVAILABLE);
    if (rng.chance(this.st.def.baseError)) return this.finish(UNAVAILABLE);
    this.next();
  }

  next(): void {
    if (this.cancelled) return;
    const steps = this.op.steps;
    if (this.i >= steps.length) return this.finish(OK);
    const step = steps[this.i++];
    const sim = this.sim;
    if ("call" in step) new CallChain(this, step.call, false).start();
    else if ("parallel" in step) {
      this.pending = step.parallel.length;
      this.failed = false;
      for (const c of step.parallel) new CallChain(this, c, true).start();
    } else if ("publish" in step) {
      const p = step.publish;
      const s = sim.span(this.traceId, this.parentId, `${p.topic} publish`, Kind.PRODUCER, this.st.def.id, this.version, {
        "messaging.system": "kafka",
        "messaging.destination.name": p.topic,
        "messaging.operation.type": "publish",
      });
      sim.at(sim.now + sim.rng.lognormal(0.5, 0.3), () => {
        sim.end(s, OK);
        sim.at(sim.now + sim.rng.lognormal(2, 0.4), () => sim.consume(p.to, p.op, p.topic, this.traceId, s.spanId, s.startNs, 0));
        this.next();
      });
    } else {
      const w = step.work;
      const s = sim.span(this.traceId, this.parentId, w.name, Kind.INTERNAL, this.st.def.id, this.version, {});
      sim.at(sim.now + sim.rng.lognormal(w.ms, w.sigma) * this.st.slow, () => {
        sim.end(s, this.cancelled ? CANCELLED : OK);
        this.next();
      });
    }
  }

  chainDone(chain: CallChain, r: Res): void {
    if (chain.parallel) {
      if (!r.ok && !chain.optional) this.failed = true;
      if (--this.pending === 0 && !this.cancelled) {
        if (this.failed) this.finish(INTERNAL);
        else this.next();
      }
    } else if (!this.cancelled) {
      if (r.ok || chain.optional) this.next();
      else this.finish(INTERNAL);
    }
  }

  cancelCalls(): void {
    const calls = this.calls.slice();
    this.calls.length = 0;
    for (const c of calls) if (!c.cancelled) c.abort();
  }
}

class ServerReq extends Handler implements Job {
  private span: Span | null = null;
  private arrival: number;
  private isRoot: boolean;

  constructor(
    sim: Simulator,
    st: Station,
    opName: string,
    traceId: string,
    parentSpanId: string,
    private client: Responder,
  ) {
    super(sim, st, OPS[st.def.id][opName], traceId);
    this.arrival = sim.now;
    this.isRoot = parentSpanId === "";
    this.parentId = parentSpanId;
    if (st.def.instrumented) {
      const sid = st.def.id;
      const [method, route] = opName.split(" ");
      const attrs: Record<string, AttrValue> = this.isRoot
        ? { "http.request.method": method, "http.route": route, "url.scheme": "https" }
        : { "rpc.system": "grpc", "rpc.service": rpcService(sid), "rpc.method": opName };
      this.span = sim.span(traceId, parentSpanId, this.isRoot ? opName : `${rpcService(sid)}/${opName}`, Kind.SERVER, sid, st.def.version, attrs);
      this.parentId = this.span.spanId;
    }
  }

  run(): void {
    this.holding = true;
    if (this.cancelled) return this.finish(CANCELLED);
    const fx = this.sim.effects(this.st);
    this.version = fx.version;
    if (this.span) {
      this.span.version = fx.version || undefined;
      this.span.attributes["tw.queue_ms"] = round3(this.sim.now - this.arrival);
    }
    if (fx.hang) return; // holds the worker until the caller gives up
    this.compute(fx);
  }

  reject(): void {
    this.finish(OVERLOADED);
  }

  /** The caller gave up: stop, cancel downstream calls, end the span. */
  cancel(): void {
    if (this.finished) return;
    this.cancelled = true;
    this.cancelCalls();
    this.finish(CANCELLED);
  }

  finish(r: Res): void {
    if (this.finished) return;
    this.finished = true;
    if (this.holding) this.sim.release(this.st);
    if (!r.ok) this.st.failures++;
    if (this.span) {
      if (this.isRoot) this.span.attributes["http.response.status_code"] = HTTP_STATUS[r.code] ?? 500;
      else this.span.attributes["rpc.grpc.status_code"] = GRPC_STATUS[r.code] ?? 2;
      this.sim.end(this.span, r);
    }
    this.client.onResponse(r);
  }
}

class ConsumerReq extends Handler implements Job {
  private span: Span | null = null;

  constructor(
    sim: Simulator,
    st: Station,
    private opName: string,
    private topic: string,
    traceId: string,
    private producerId: string,
    private enqueuedNs: number,
    private delivery: number,
  ) {
    super(sim, st, OPS[st.def.id][opName], traceId);
  }

  run(): void {
    this.holding = true;
    const sim = this.sim;
    const fx = sim.effects(this.st);
    this.version = fx.version;
    this.span = sim.span(this.traceId, this.producerId, `${this.topic} process`, Kind.CONSUMER, this.st.def.id, fx.version, {
      "messaging.system": "kafka",
      "messaging.destination.name": this.topic,
      "messaging.operation.type": "process",
      "messaging.consumer.group.name": this.st.def.id,
      "messaging.message.delivery_attempt": this.delivery + 1,
      "tw.enqueued_ns": this.enqueuedNs,
    });
    this.parentId = this.span.spanId;
    sim.at(sim.now + CONSUMER_DEADLINE_MS, () => {
      if (this.finished) return;
      this.cancelled = true;
      this.cancelCalls();
      this.finish(TIMEOUT);
    });
    if (fx.hang) return;
    this.compute(fx);
  }

  /** The broker keeps the message; it is offered again shortly. */
  reject(): void {
    this.sim.at(this.sim.now + 1000, () => this.redeliver(this.delivery));
  }

  private redeliver(delivery: number): void {
    this.sim.consume(this.st.def.id, this.opName, this.topic, this.traceId, this.producerId, this.enqueuedNs, delivery);
  }

  finish(r: Res): void {
    if (this.finished) return;
    this.finished = true;
    if (this.holding) this.sim.release(this.st);
    if (!r.ok) this.st.failures++;
    if (this.span) this.sim.end(this.span, r);
    if (!r.ok && this.delivery < MAX_REDELIVERIES) this.sim.at(this.sim.now + 1000, () => this.redeliver(this.delivery + 1));
  }
}

/** A call with its policy: skipped with probability 1 - p, retried, then orElse on failure or miss on success. */
class CallChain {
  readonly optional: boolean;
  private spec: CallSpec;

  constructor(
    readonly owner: Handler,
    spec: CallSpec,
    readonly parallel: boolean,
  ) {
    this.spec = spec;
    this.optional = !!spec.optional;
  }

  start(): void {
    const p = this.spec.p;
    if (p !== undefined && !this.owner.sim.rng.chance(p)) return this.owner.chainDone(this, OK);
    this.attempt(0);
  }

  private attempt(n: number): void {
    if (this.owner.cancelled) return;
    new ClientCall(this, this.spec, n).start();
  }

  onAttempt(n: number, r: Res): void {
    const sim = this.owner.sim;
    if (!r.ok && r.retryable && n < this.spec.retries && !this.owner.cancelled) {
      const backoff = 25 * Math.pow(2, n) * sim.rng.range(0.5, 1.5);
      sim.at(sim.now + backoff, () => this.attempt(n + 1));
      return;
    }
    if (this.owner.cancelled) return this.owner.chainDone(this, r);
    if (!r.ok && this.spec.orElse) {
      this.spec = this.spec.orElse;
      this.start();
    } else if (r.ok && this.spec.miss && sim.rng.chance(this.spec.miss.p)) {
      this.spec = this.spec.miss.call;
      this.start();
    } else this.owner.chainDone(this, r);
  }
}

/** One attempt of a call: a CLIENT span with a timeout. */
class ClientCall implements Responder {
  cancelled = false;
  private finished = false;
  private callee: ServerReq | null = null;
  private span!: Span;
  private target: Station;

  constructor(
    private chain: CallChain,
    private spec: CallSpec,
    private n: number,
  ) {
    this.target = chain.owner.sim.stations.get(spec.to)!;
  }

  start(): void {
    const h = this.chain.owner;
    const sim = h.sim;
    this.span = sim.span(h.traceId, h.parentId, clientName(this.spec), Kind.CLIENT, h.st.def.id, h.version, clientAttrs(this.spec, this.target.def, this.n));
    h.calls.push(this);
    sim.at(sim.now + this.spec.timeoutMs, () => this.timeout());
    sim.at(sim.now + sim.netDelay(this.spec.to), () => {
      if (!this.cancelled) this.callee = sim.serve(this.spec.to, this.spec.op, h.traceId, this.span.spanId, this);
    });
  }

  onResponse(r: Res): void {
    const sim = this.chain.owner.sim;
    sim.at(sim.now + sim.netDelay(this.spec.to), () => this.complete(r));
  }

  private timeout(): void {
    if (this.finished) return;
    this.stop(TIMEOUT);
  }

  /** The caller itself was cancelled. */
  abort(): void {
    this.stop(CANCELLED);
  }

  private stop(r: Res): void {
    this.cancelled = true;
    this.complete(r);
    const sim = this.chain.owner.sim;
    sim.at(sim.now + sim.netDelay(this.spec.to), () => this.callee?.cancel());
  }

  private complete(r: Res): void {
    if (this.finished) return;
    this.finished = true;
    const h = this.chain.owner;
    const k = h.calls.indexOf(this);
    if (k >= 0) h.calls.splice(k, 1);
    const a = this.span.attributes;
    if (this.target.def.kind === "external") a["http.response.status_code"] = HTTP_STATUS[r.code] ?? 500;
    else if (this.target.def.instrumented) a["rpc.grpc.status_code"] = GRPC_STATUS[r.code] ?? 2;
    else if (!r.ok) a["error.type"] = r.code === "DEADLINE_EXCEEDED" ? "timeout" : r.code.toLowerCase();
    h.sim.end(this.span, r);
    this.chain.onAttempt(this.n, r);
  }
}

const RPC_NAMES = new Map<string, string>();
function rpcService(sid: string): string {
  let n = RPC_NAMES.get(sid);
  if (!n) RPC_NAMES.set(sid, (n = sid.charAt(0).toUpperCase() + sid.slice(1) + "Service"));
  return n;
}

function clientName(spec: CallSpec): string {
  if (spec.to === "postgres" || spec.to === "redis") return spec.op;
  if (spec.to === "payment-provider") return spec.op.split(" ")[0];
  return `${rpcService(spec.to)}/${spec.op}`;
}

const ATTR_TEMPLATES = new Map<string, Record<string, AttrValue>>();
function clientAttrs(spec: CallSpec, target: ServiceDef, attempt: number): Record<string, AttrValue> {
  const key = `${spec.to}|${spec.op}`;
  let t = ATTR_TEMPLATES.get(key);
  if (!t) {
    t = { "peer.service": spec.to };
    if (target.kind === "database") {
      const [verb, table] = spec.op.split(" ");
      Object.assign(t, { "db.system": "postgresql", "db.namespace": "shop", "db.operation.name": verb, "db.collection.name": table, "server.address": "pg-primary.internal" });
    } else if (target.kind === "cache") {
      Object.assign(t, { "db.system": "redis", "db.operation.name": spec.op.split(" ")[0], "server.address": "redis.internal" });
    } else if (target.kind === "external") {
      const [method, path] = spec.op.split(" ");
      Object.assign(t, { "http.request.method": method, "url.full": `https://api.cardco.example${path}`, "server.address": "api.cardco.example" });
    } else {
      Object.assign(t, { "rpc.system": "grpc", "rpc.service": rpcService(spec.to), "rpc.method": spec.op, "server.address": `${spec.to}.internal` });
    }
    ATTR_TEMPLATES.set(key, t);
  }
  const a = { ...t };
  if (attempt > 0) a["http.request.resend_count"] = attempt;
  return a;
}

function bumpVersion(v: string): string {
  const [a, b] = v.split(".").map(Number);
  return `${a}.${(b || 0) + 1}.0`;
}
