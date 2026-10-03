// npm run serve  →  http://127.0.0.1:8786
//
//   curl -N localhost:8786/v1/messages -H 'x-api-key: relay-demo-acme' -H 'content-type: application/json' \
//     -d '{"model":"relay-auto","max_tokens":300,"stream":true,"messages":[{"role":"user","content":"My email is dana@example.com, how do I reset my password?"}]}'
//
// Environment: PORT (8786), HOST (127.0.0.1), ANTHROPIC_API_KEY (real upstream;
// otherwise the simulator), RELAY_SIM_FAIL_RATE (0..1), RELAY_SIM_TAIL (0..1),
// RELAY_CONFIG (v1), RELAY_DRAIN_MS (10000).

import { createApp } from "./app";
import { buildGateway } from "./gateway";

const port = Number(process.env.PORT ?? 8786);
const host = process.env.HOST ?? "127.0.0.1";
const drainMs = Number(process.env.RELAY_DRAIN_MS ?? 10_000);

const { gateway, upstream } = buildGateway(process.env);
const log = (line: Record<string, unknown>) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...line }) + "\n");
const server = createApp({ gateway, upstream, log });

server.listen(port, host, () => {
  log({ msg: "relay listening", url: `http://${host}:${port}`, upstream, tenants: gateway.getTenants().map((t) => t.id) });
});

let stopping = false;
function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  log({ msg: "draining", signal, inflight: server.inflight() });
  // Stop accepting, let open streams finish, then exit (or give up after the drain window).
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => {
    log({ msg: "drain timeout", inflight: server.inflight() });
    server.closeAllConnections();
    process.exit(0);
  }, drainMs).unref();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
