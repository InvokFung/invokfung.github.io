import type { Collection, MongoClient as MongoClientType } from "mongodb";
import { ConcurrencyError, checkAppend, summaryOf, type EventStore } from "@arena/core";
import type { MatchEvent, MatchSummary, StoredEvent } from "@arena/engine";

interface EventDoc {
  matchId: string;
  seq: number;
  type: MatchEvent["type"];
  at: number;
  event: MatchEvent;
}

/**
 * MongoDB event store. One collection, one document per event, with a unique
 * (matchId, seq) index: the index is the concurrency control, so two writers racing
 * on the same stream cannot both succeed. Finished-match summaries are read straight
 * from the match_finished events (index on type + at), so there is no second
 * collection to keep in sync. Contract-tested against a mongo:7 container.
 */
export class MongoEventStore implements EventStore {
  readonly kind = "mongo";

  private constructor(
    private readonly client: MongoClientType,
    private readonly events: Collection<EventDoc>,
  ) {}

  static async connect(url: string, dbName: string): Promise<MongoEventStore> {
    // Loaded on demand so the driver costs nothing unless ARENA_STORE=mongo.
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000, appName: "triplefind-arena" });
    await client.connect();
    const events = client.db(dbName).collection<EventDoc>("match_events");
    await events.createIndexes([
      { key: { matchId: 1, seq: 1 }, unique: true, name: "stream" },
      { key: { type: 1, at: 1, matchId: 1 }, name: "by_type_time" },
    ]);
    return new MongoEventStore(client, events);
  }

  async append(matchId: string, expectedSeq: number, batch: readonly StoredEvent[]): Promise<void> {
    const last = await this.events.find({ matchId }, { projection: { seq: 1 } }).sort({ seq: -1 }).limit(1).next();
    checkAppend(matchId, expectedSeq, last ? last.seq + 1 : 0, batch);
    try {
      await this.events.insertMany(
        batch.map((e) => ({ matchId: e.matchId, seq: e.seq, type: e.event.type, at: e.event.at, event: e.event })),
        { ordered: true },
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new ConcurrencyError(matchId, expectedSeq, -1);
      throw err;
    }
  }

  async load(matchId: string): Promise<StoredEvent[]> {
    const docs = await this.events.find({ matchId }).sort({ seq: 1 }).toArray();
    return docs.map((d) => ({ matchId: d.matchId, seq: d.seq, event: d.event }));
  }

  async recentFinished(limit: number): Promise<MatchSummary[]> {
    return this.finished(-1, limit);
  }

  async allFinished(): Promise<MatchSummary[]> {
    return this.finished(1, 0);
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.db("admin").command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async finished(direction: 1 | -1, limit: number): Promise<MatchSummary[]> {
    const cursor = this.events.find({ type: "match_finished" }).sort({ at: direction, matchId: direction });
    if (limit > 0) cursor.limit(limit);
    const docs = await cursor.toArray();
    return docs.flatMap((d) => summaryOf({ matchId: d.matchId, seq: d.seq, event: d.event }) ?? []);
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 11000;
}
