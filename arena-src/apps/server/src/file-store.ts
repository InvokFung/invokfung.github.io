import { mkdir, open, readFile, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { MemoryEventStore, checkAppend, summaryOf } from "@arena/core";
import type { StoredEvent } from "@arena/engine";

/**
 * Append-only JSON Lines log on disk, one event per line, with the in-memory index
 * rebuilt on open. Appends are serialized through one queue so the file order is the
 * commit order and the concurrency check cannot race. A torn final line (crash mid
 * write) is detected on open and ignored. Good for a single node with a volume;
 * use MongoDB for more than one replica.
 */
export class FileEventStore extends MemoryEventStore {
  override readonly kind = "file";
  private queue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly handle: FileHandle,
    private readonly fsync: boolean,
  ) {
    super();
  }

  static async open(path: string, opts: { fsync?: boolean; onWarn?: (msg: string) => void } = {}): Promise<FileEventStore> {
    await mkdir(dirname(path), { recursive: true });
    const existing = await readFile(path, "utf8").catch((err: NodeJS.ErrnoException) => (err.code === "ENOENT" ? "" : Promise.reject(err)));
    const store = new FileEventStore(await open(path, "a"), opts.fsync ?? false);
    const lines = existing.split("\n");
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      let e: StoredEvent;
      try {
        e = JSON.parse(line) as StoredEvent;
      } catch {
        if (i >= lines.length - 2) return opts.onWarn?.(`ignoring torn last line ${i + 1} of ${path}`);
        throw new Error(`corrupt event log ${path} at line ${i + 1}`);
      }
      store.index(e);
    });
    return store;
  }

  override append(matchId: string, expectedSeq: number, events: readonly StoredEvent[]): Promise<void> {
    const run = this.queue.then(async () => {
      checkAppend(matchId, expectedSeq, this.streams.get(matchId)?.length ?? 0, events);
      const lines = events.map((e) => JSON.stringify(e));
      await this.handle.appendFile(lines.map((l) => l + "\n").join(""));
      if (this.fsync) await this.handle.datasync();
      for (const line of lines) this.index(JSON.parse(line) as StoredEvent); // keep a private copy
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  override async close(): Promise<void> {
    await this.queue;
    await this.handle.close();
  }

  private index(e: StoredEvent): void {
    const stream = this.streams.get(e.matchId) ?? [];
    if (e.seq !== stream.length) throw new Error(`event log out of order for ${e.matchId}: seq ${e.seq} after ${stream.length}`);
    stream.push(e);
    this.streams.set(e.matchId, stream);
    const s = summaryOf(e);
    if (s) this.summaries.push(s);
  }
}
