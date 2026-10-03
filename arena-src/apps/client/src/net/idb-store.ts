import { checkAppend, summaryOf, type EventStore } from "@arena/core";
import { compareSummaries, type MatchSummary, type StoredEvent } from "@arena/engine";

const DB = "triplefind-arena";
const VERSION = 1;

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/**
 * The Local Arena's event store: the same EventStore contract, persisted in IndexedDB,
 * so replays and the ladder survive a reload of the static page. Each append runs in
 * one readwrite transaction that also checks the stream position, which IndexedDB
 * serializes for us.
 */
export class IdbEventStore implements EventStore {
  readonly kind = "indexeddb";

  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbEventStore> {
    const open = indexedDB.open(DB, VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("events", { keyPath: ["matchId", "seq"] });
      db.createObjectStore("summaries", { keyPath: "matchId" }).createIndex("finishedAt", "finishedAt");
    };
    return new IdbEventStore(await req(open));
  }

  async append(matchId: string, expectedSeq: number, events: readonly StoredEvent[]): Promise<void> {
    const tx = this.db.transaction(["events", "summaries"], "readwrite");
    const store = tx.objectStore("events");
    const range = IDBKeyRange.bound([matchId, 0], [matchId, Number.MAX_SAFE_INTEGER]);
    const length = await req(store.count(range));
    try {
      checkAppend(matchId, expectedSeq, length, events);
    } catch (err) {
      tx.abort();
      throw err;
    }
    for (const e of events) {
      store.add(e);
      const s = summaryOf(e);
      if (s) tx.objectStore("summaries").put(s);
    }
    await done(tx);
  }

  async load(matchId: string): Promise<StoredEvent[]> {
    const tx = this.db.transaction("events", "readonly");
    const range = IDBKeyRange.bound([matchId, 0], [matchId, Number.MAX_SAFE_INTEGER]);
    return (await req(tx.objectStore("events").getAll(range))) as StoredEvent[];
  }

  async recentFinished(limit: number): Promise<MatchSummary[]> {
    return (await this.allFinished()).reverse().slice(0, limit);
  }

  async allFinished(): Promise<MatchSummary[]> {
    const tx = this.db.transaction("summaries", "readonly");
    const all = (await req(tx.objectStore("summaries").getAll())) as MatchSummary[];
    return all.sort(compareSummaries);
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
