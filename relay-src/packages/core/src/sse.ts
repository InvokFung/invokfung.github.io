// Server-Sent Events, incrementally, per the WHATWG HTML "event stream"
// interpretation rules: CRLF, LF or CR line endings (a CR at the end of one
// chunk and an LF at the start of the next are one line ending), comment lines,
// multi-line data, "field" with no colon, one optional space after the colon,
// a leading BOM, and no dispatch for an event that was never terminated.

export interface SSEEvent {
  /** The `event:` field, or "message". */
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export class SSEParser {
  private partial = "";
  private data = "";
  private hasData = false;
  private type = "";
  private lastId: string | undefined;
  private retry: number | undefined;
  private skipLF = false;
  private started = false;

  /** Feeds decoded text; returns the events completed by it. */
  push(chunk: string): SSEEvent[] {
    const out: SSEEvent[] = [];
    if (!chunk) return out;
    if (!this.started) {
      this.started = true;
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
    }
    let i = 0;
    if (this.skipLF) {
      this.skipLF = false;
      if (chunk.charCodeAt(0) === 10) i = 1;
    }
    let start = i;
    for (; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      const line = this.partial + chunk.slice(start, i);
      this.partial = "";
      this.line(line, out);
      if (c === 13) {
        if (i + 1 < chunk.length) {
          if (chunk.charCodeAt(i + 1) === 10) i++;
        } else this.skipLF = true;
      }
      start = i + 1;
    }
    this.partial += chunk.slice(start);
    return out;
  }

  private line(line: string, out: SSEEvent[]): void {
    if (line === "") {
      if (this.hasData) {
        const ev: SSEEvent = { event: this.type || "message", data: this.data.endsWith("\n") ? this.data.slice(0, -1) : this.data };
        if (this.lastId !== undefined) ev.id = this.lastId;
        if (this.retry !== undefined) ev.retry = this.retry;
        out.push(ev);
      }
      this.data = "";
      this.hasData = false;
      this.type = "";
      return;
    }
    if (line.charCodeAt(0) === 58) return; // ":" comment
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.charCodeAt(0) === 32) value = value.slice(1);
    switch (field) {
      case "event":
        this.type = value;
        break;
      case "data":
        this.data += value + "\n";
        this.hasData = true;
        break;
      case "id":
        if (!value.includes("\0")) this.lastId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
    }
  }
}

/** One SSE frame. `data` may contain newlines; each line becomes its own `data:` field. */
export function encodeSSE(event: string, data: string): string {
  return `event: ${event}\n` + data.split(/\r\n|\r|\n/).map((l) => `data: ${l}\n`).join("") + "\n";
}
