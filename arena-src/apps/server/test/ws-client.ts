import WebSocket from "ws";
import type { ClientMessage, ServerMessage, ServerMessageOf, ServerMessageType } from "@arena/protocol";

/** A real WebSocket client for integration tests: records everything, waits on predicates. */
export class WsTestClient {
  readonly inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (data) => {
      this.inbox.push(JSON.parse(data.toString()) as ServerMessage);
      for (const w of this.waiters.splice(0)) w();
    });
    this.closed = new Promise((resolve) => ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() })));
  }

  static open(url: string, origin?: string): Promise<WsTestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, origin ? { origin } : {});
      const client = new WsTestClient(ws);
      ws.once("open", () => resolve(client));
      ws.once("error", reject);
      ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
  }

  static async hello(url: string, name: string, token?: string): Promise<WsTestClient> {
    const c = await WsTestClient.open(url);
    c.send({ type: "hello", protocol: 1, name, ...(token ? { token } : {}) });
    await c.waitFor("welcome");
    return c;
  }

  get welcome(): ServerMessageOf<"welcome"> {
    return this.of("welcome").at(-1) as ServerMessageOf<"welcome">;
  }

  send(msg: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  of<T extends ServerMessageType>(type: T): ServerMessageOf<T>[] {
    return this.inbox.filter((m): m is ServerMessageOf<T> => m.type === type);
  }

  /** Resolve with the first message (from index `since`) of `type` matching `pred`. */
  waitFor<T extends ServerMessageType>(type: T, pred: (m: ServerMessageOf<T>) => boolean = () => true, opts: { since?: number; timeoutMs?: number } = {}): Promise<ServerMessageOf<T>> {
    const since = opts.since ?? 0;
    return new Promise((resolve, reject) => {
      const check = (): boolean => {
        for (let i = since; i < this.inbox.length; i++) {
          const m = this.inbox[i]!;
          if (m.type === type && pred(m as ServerMessageOf<T>)) {
            resolve(m as ServerMessageOf<T>);
            return true;
          }
        }
        return false;
      };
      if (check()) return;
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}; inbox: ${this.inbox.map((m) => m.type).join(",")}`)), opts.timeoutMs ?? 5000);
      const loop = () => {
        if (check()) clearTimeout(timer);
        else this.waiters.push(loop);
      };
      this.waiters.push(loop);
    });
  }

  close(): void {
    this.ws.close();
  }

  terminate(): void {
    this.ws.terminate();
  }
}
