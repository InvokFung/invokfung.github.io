import { MetricsRegistry, type Counter, type Histogram } from "./metrics";

export interface ArenaGauges {
  connections(): number;
  rooms(): number;
  matches(): number;
  queue(): number;
}

/** The arena's metric set; names follow Prometheus conventions. */
export class ArenaMetrics {
  readonly registry = new MetricsRegistry();
  readonly messagesIn: Counter;
  readonly messagesOut: Counter;
  readonly rejected: Counter;
  readonly events: Counter;
  readonly matchesFinished: Counter;
  readonly storeFailures: Counter;
  readonly flipHandleMs: Histogram;
  readonly storeAppendMs: Histogram;

  constructor(gauges: ArenaGauges) {
    const r = this.registry;
    r.gauge("arena_connections", "Open client connections", gauges.connections);
    r.gauge("arena_rooms", "Rooms in memory", gauges.rooms);
    r.gauge("arena_matches_live", "Matches in countdown or play", gauges.matches);
    r.gauge("arena_queue_waiting", "Players in the quick-match queue", gauges.queue);
    this.messagesIn = r.counter("arena_messages_in_total", "Client messages accepted, by type");
    this.messagesOut = r.counter("arena_frames_out_total", "Frames delivered to connections");
    this.rejected = r.counter("arena_messages_rejected_total", "Client messages refused, by error code");
    this.events = r.counter("arena_events_total", "Match events committed, by type");
    this.matchesFinished = r.counter("arena_matches_finished_total", "Matches finished, by reason");
    this.storeFailures = r.counter("arena_store_append_failures_total", "Event batches that could not be persisted");
    this.flipHandleMs = r.histogram("arena_flip_handle_ms", "Server time to validate, apply and fan out one flip (ms)");
    this.storeAppendMs = r.histogram("arena_store_append_ms", "Event store append latency (ms)");
  }
}
