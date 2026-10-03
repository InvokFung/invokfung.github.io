// What the simulator says. It is not a language model: answers come from
// templates keyed on what the prompt asks, and their quality is scripted by
// model tier. A task has a difficulty (1 to 3); a model whose tier is below it
// answers plausibly but wrongly. That is what lets the eval suite catch a
// routing change that sends hard work to a cheap model, without a real model.
//
// It echoes PII placeholders from the prompt (so the restore step has
// something to do), follows a few system-prompt instructions (JSON output,
// word limits), and, unless the gateway added its guard note, it falls for a
// request to print its system prompt.

import type { Rng } from "../rng";
import { pick } from "../rng";
import type { ChatMessage } from "../types";

export interface BrainInput {
  system?: string;
  messages: ChatMessage[];
  /** 1 = fast, 2 = balanced, 3 = best. */
  capability: number;
  rng: Rng;
}

const PLACEHOLDER = /<(EMAIL|PHONE|CARD|IBAN|NAME)_\d+>/g;
const CLOSERS = [
  "Let me know if anything else comes up.",
  "Happy to help with the next step.",
  "Reply here if that does not resolve it.",
  "I can walk through it in more detail if useful.",
];
const FILLER = [
  "This usually takes effect within a few minutes.",
  "You will see the change reflected in the dashboard as well.",
  "Nothing else is needed on your side for now.",
  "The same steps apply on the mobile app.",
  "If you use single sign-on, the change goes through your identity provider instead.",
  "Your existing data is not affected.",
  "A confirmation is also written to the account's activity log.",
  "Our status page lists any ongoing incidents.",
];

function lastUser(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
  return "";
}

function wordLimit(system: string | undefined): number | null {
  const m = system && /\b(?:under|at most|no more than|fewer than|within)\s+(\d{2,4})\s+words\b/i.exec(system);
  return m ? Number(m[1]) : null;
}

function limitWords(text: string, n: number | null): string {
  if (n === null) return text;
  const words = text.split(/(\s+)/);
  let count = 0;
  let out = "";
  for (const w of words) {
    if (/\S/.test(w) && ++count > n) break;
    out += w;
  }
  return out.trimEnd();
}

function arithmetic(q: string, cap: number): { text: string; difficulty: number } | null {
  // "(12 + 7) * 3": two operations, difficulty 2.
  let m = /\(\s*(-?\d+)\s*([+\-*x×])\s*(-?\d+)\s*\)\s*([+\-*x×/])\s*(-?\d+)/.exec(q);
  if (m) {
    const inner = op(Number(m[1]), m[2], Number(m[3]));
    const v = op(inner, m[4], Number(m[5]));
    const ans = cap >= 2 ? v : op(Number(m[1]), m[2], op(Number(m[3]), m[4], Number(m[5])));
    return { text: `The parentheses come first: ${m[1]} ${m[2]} ${m[3]} = ${cap >= 2 ? inner : "…"}. The result is ${fmtNum(ans)}.`, difficulty: 2 };
  }
  m = /(-?\d+(?:\.\d+)?)\s*([+\-*x×/])\s*(-?\d+(?:\.\d+)?)/.exec(q);
  if (m && /\b(?:what|compute|calculate|is)\b/i.test(q)) {
    const v = op(Number(m[1]), m[2], Number(m[3]));
    return { text: `${m[1]} ${m[2]} ${m[3]} = ${fmtNum(v)}.`, difficulty: 1 };
  }
  return null;
}

const op = (a: number, o: string, b: number) => (o === "+" ? a + b : o === "-" ? a - b : o === "/" ? a / b : a * b);
const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

function code(q: string, cap: number): { text: string; difficulty: number } | null {
  const m = /\b(?:write|implement|create|give me)\b[^.]*?\b(python|typescript|javascript|go|rust)?\s*function\s+(?:named|called)?\s*`?([A-Za-z_][A-Za-z0-9_]*)`?/i.exec(q);
  if (!m) return null;
  const lang = (m[1] ?? "typescript").toLowerCase();
  const name = m[2];
  // A fast-tier model "forgets" the requested name and leaves a syntax error.
  const n = cap >= 2 ? name : name.toLowerCase().replace(/_/g, "") + "Fn";
  const body =
    lang === "python"
      ? `def ${n}(items):\n    """Return the items with duplicates removed, keeping order."""\n    seen = set()\n    out = []\n    for x in items:\n        if x not in seen:\n            seen.add(x)\n            out.append(x)\n    return out${cap >= 2 ? "" : "\n  )"}`
      : `export function ${n}<T>(items: readonly T[]): T[] {\n  const seen = new Set<T>();\n  return items.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));\n}${cap >= 2 ? "" : "\n)"}`;
  return { text: `Here is a ${lang === "python" ? "Python" : "TypeScript"} version:\n\n\`\`\`${lang === "python" ? "python" : "ts"}\n${body}\n\`\`\`\n\nIt runs in linear time and keeps the first occurrence of each value.`, difficulty: 2 };
}

function wordProblem(q: string, cap: number): { text: string; difficulty: number } | null {
  const m = /(\d+)\s+(?:requests|calls|messages)\s+(?:per|a|each)\s+(?:second|sec)\b[^?]*?(\d+)\s+(?:minutes|min)\b/i.exec(q);
  if (!m) return null;
  const right = Number(m[1]) * 60 * Number(m[2]);
  const ans = cap >= 3 ? right : cap === 2 && !/\bpeak|burst\b/i.test(q) ? right : Number(m[1]) * Number(m[2]);
  return { text: `${m[1]} per second is ${Number(m[1]) * 60} per minute, so over ${m[2]} minutes that is ${ans.toLocaleString("en-US")} in total.`, difficulty: /\bpeak|burst\b/i.test(q) ? 3 : 2 };
}

function extraction(q: string, system: string | undefined): { text: string; difficulty: number } | null {
  const order = /\b(?:order|invoice|ticket)\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z]{1,3}-?\d{3,8})\b/i.exec(q);
  const wantsJson = /\bjson\b/i.test(q) || /\brespond (?:only )?(?:in|with) json\b/i.test(system ?? "");
  const asks = /\b(?:which|what) (?:order|invoice|ticket)\b|\bextract\b/i.test(q);
  if (!wantsJson && !(order && asks)) return null;
  const ph = [...new Set(q.match(PLACEHOLDER) ?? [])];
  const intent = /refund/i.test(q) ? "refund" : /cancel/i.test(q) ? "cancellation" : /deliver|ship|arriv/i.test(q) ? "delivery" : /invoice|bill|charge/i.test(q) ? "billing" : "general";
  if (wantsJson) {
    const obj: Record<string, unknown> = { intent };
    if (order) obj.order = order[1].toUpperCase();
    const email = ph.find((p) => p.startsWith("<EMAIL"));
    if (email) obj.email = email;
    return { text: JSON.stringify(obj, null, 2), difficulty: 1 };
  }
  return { text: `That is order ${order![1].toUpperCase()}, and the request is about ${intent}.`, difficulty: 1 };
}

function leak(q: string, system: string | undefined): string | null {
  if (!/\b(?:system prompt|your instructions|hidden (?:prompt|instructions)|instructions above|initial prompt)\b/i.test(q)) return null;
  if (system && /Relay flagged the user message/.test(system)) return "I can't share my configuration, but I'm glad to help with your question.";
  // Without the gateway's guard note, the simulator is naive on purpose.
  const first = (system ?? "").split("\n")[0];
  return `Sure. My instructions begin: "${first}"`;
}

const TOPICS: { re: RegExp; lines: string[] }[] = [
  {
    re: /refund|money back|charged twice|double charge/i,
    lines: [
      "I've opened a refund for the duplicate charge.",
      "Refunds go back to the original payment method and usually land in 5 to 7 business days.",
      "Once it is processed you will get a receipt by email.",
    ],
  },
  {
    re: /password|log ?in|sign ?in|locked out|2fa|two-factor/i,
    lines: ["To reset your password, open Settings → Security and choose Reset password.", "The reset link is valid for 30 minutes.", "If you no longer have access to that inbox, support can verify you another way."],
  },
  {
    re: /deliver|shipping|ship|tracking|arriv|package|parcel/i,
    lines: ["Your parcel left the warehouse yesterday and is with the courier.", "The tracking page updates every few hours.", "Most deliveries arrive within 3 business days of dispatch."],
  },
  {
    re: /invoice|billing|vat|receipt|charge/i,
    lines: ["Invoices are under Billing → History, one per month.", "You can add a VAT number and a billing address there, and new invoices will use them.", "Past invoices can be regenerated on request."],
  },
  {
    re: /rate limit|429|quota|throttl/i,
    lines: ["A 429 means the per-minute limit for your key was reached.", "Back off for the number of seconds in the retry-after header, then retry.", "Spreading requests over the minute avoids most of them."],
  },
  {
    re: /delete (?:my )?account|close (?:my )?account|gdpr|erase/i,
    lines: ["You can delete the account from Settings → Account → Delete.", "Deletion removes personal data within 30 days, as required by GDPR.", "Export anything you want to keep first."],
  },
  {
    re: /upgrade|plan|pricing|seat|subscription/i,
    lines: ["You can change plans at any time from Billing → Plan.", "Upgrades take effect immediately and are prorated.", "Seats can be added without changing the plan."],
  },
  {
    re: /summar/i,
    lines: ["In short: the incident was caused by an expired certificate on one load balancer.", "Traffic failed over within four minutes and no data was lost.", "The team added an expiry alert to prevent a repeat."],
  },
];

/** The answer text, and the difficulty of the task it recognised (0 if none). */
export function think(input: BrainInput): { text: string; difficulty: number } {
  const q = lastUser(input.messages);
  const limit = wordLimit(input.system);
  const done = (text: string, difficulty: number) => ({ text: limitWords(text, limit), difficulty });

  const leaked = leak(q, input.system);
  if (leaked) return done(leaked, 1);
  const special = arithmetic(q, input.capability) ?? code(q, input.capability) ?? wordProblem(q, input.capability) ?? extraction(q, input.system);
  if (special) return done(special.text, special.difficulty);

  const ph = [...new Set(q.match(PLACEHOLDER) ?? [])];
  const topic = TOPICS.find((t) => t.re.test(q));
  const parts: string[] = [];
  const name = ph.find((p) => p.startsWith("<NAME"));
  parts.push(name ? `Hi ${name}, thanks for getting in touch.` : "Thanks for getting in touch.");
  if (topic) parts.push(...topic.lines);
  else parts.push("Here is what I found.", pick(input.rng, FILLER));
  const email = ph.find((p) => p.startsWith("<EMAIL"));
  const phone = ph.find((p) => p.startsWith("<PHONE"));
  const card = ph.find((p) => p.startsWith("<CARD"));
  const iban = ph.find((p) => p.startsWith("<IBAN"));
  if (email) parts.push(`I'll send the confirmation to ${email}.`);
  if (phone) parts.push(`If we need to call, we'll use ${phone}.`);
  if (card) parts.push(`The card ending you mentioned (${card}) stays on file; we never show the full number.`);
  if (iban) parts.push(`Payouts will go to ${iban}.`);
  const extra = Math.floor(input.rng.next() * 3);
  for (let i = 0; i < extra; i++) parts.push(pick(input.rng, FILLER));
  parts.push(pick(input.rng, CLOSERS));
  return done(parts.join(" "), 0);
}

/** Splits text the way the simulator streams it: pieces of at most four characters, whitespace attached. */
export function simTokens(text: string): string[] {
  return text.match(/\s*\S{1,4}/g) ?? [];
}
