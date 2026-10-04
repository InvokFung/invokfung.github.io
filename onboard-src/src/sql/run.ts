// Executes a parsed SELECT over in-memory tables: filter, group with
// aggregates, having, project, distinct, sort, limit. NULL follows SQL's
// three-valued logic; numbers and numeric strings compare as numbers.

import { parse, SqlError, type Expr, type Select, type Value } from "./parse";

export type Row = Record<string, Value>;

export interface SqlTable {
  name: string;
  columns: string[];
  rows: Row[];
  description?: string;
}

export interface SqlResult {
  columns: string[];
  rows: Value[][];
  /** Rows read from the table. */
  scanned: number;
  /** Rows before LIMIT. */
  total: number;
  ms: number;
}

const AGGREGATES = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX", "GROUP_CONCAT"]);

function hasAggregate(e: Expr | null): boolean {
  if (!e) return false;
  switch (e.k) {
    case "fn":
      return AGGREGATES.has(e.name) || e.args.some(hasAggregate);
    case "un":
      return hasAggregate(e.e);
    case "bin":
      return hasAggregate(e.l) || hasAggregate(e.r);
    case "in":
      return hasAggregate(e.e) || e.list.some(hasAggregate);
    case "between":
      return hasAggregate(e.e) || hasAggregate(e.lo) || hasAggregate(e.hi);
    case "like":
      return hasAggregate(e.e) || hasAggregate(e.pat);
    case "isnull":
      return hasAggregate(e.e);
    case "case":
      return hasAggregate(e.base) || hasAggregate(e.else) || e.whens.some((w) => hasAggregate(w.when) || hasAggregate(w.then));
    default:
      return false;
  }
}

const isNum = (v: Value): v is number => typeof v === "number";
const numeric = (v: Value): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** -1, 0, 1, or null when either side is NULL. Numbers (and numeric strings against numbers) compare numerically. */
export function compare(a: Value, b: Value): number | null {
  if (a === null || b === null) return null;
  if (isNum(a) || isNum(b) || typeof a === "boolean" || typeof b === "boolean") {
    const x = numeric(a);
    const y = numeric(b);
    if (x !== null && y !== null) return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Sort order with NULLs first, as in SQLite. */
function sortCompare(a: Value, b: Value): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return compare(a, b) ?? 0;
}

const truthy = (v: Value): boolean | null => (v === null ? null : typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : v !== "" && v !== "0");

function likeToRegex(pat: string, ci: boolean): RegExp {
  let re = "^";
  for (const c of pat) re += c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(re + "$", ci ? "is" : "s");
}

interface Ctx {
  row: Row;
  /** Rows of the group, when evaluating with aggregates. */
  group: Row[] | null;
  columns: Set<string>;
  /** Output values by alias, for HAVING and ORDER BY. */
  aliases?: Map<string, Value>;
}

const SCALAR: Record<string, (args: Value[]) => Value> = {
  LOWER: ([s]) => (s === null ? null : String(s).toLowerCase()),
  UPPER: ([s]) => (s === null ? null : String(s).toUpperCase()),
  LENGTH: ([s]) => (s === null ? null : String(s).length),
  TRIM: ([s]) => (s === null ? null : String(s).trim()),
  SUBSTR: ([s, start, len]) => {
    if (s === null) return null;
    const str = String(s);
    const from = Math.max(0, (numeric(start) ?? 1) - 1);
    return len === undefined || len === null ? str.slice(from) : str.slice(from, from + (numeric(len) ?? 0));
  },
  COALESCE: (args) => args.find((a) => a !== null) ?? null,
  IFNULL: ([a, b]) => (a === null ? b : a),
  NULLIF: ([a, b]) => (compare(a, b) === 0 ? null : a),
  ROUND: ([x, d]) => {
    const n = numeric(x);
    if (n === null) return null;
    const f = 10 ** (numeric(d) ?? 0);
    return Math.round(n * f) / f;
  },
  ABS: ([x]) => {
    const n = numeric(x);
    return n === null ? null : Math.abs(n);
  },
  REPLACE: ([s, a, b]) => (s === null ? null : String(s).split(String(a ?? "")).join(String(b ?? ""))),
  INSTR: ([s, sub]) => (s === null || sub === null ? null : String(s).indexOf(String(sub)) + 1),
};
SCALAR.SUBSTRING = SCALAR.SUBSTR;

function evaluate(e: Expr, ctx: Ctx): Value {
  switch (e.k) {
    case "lit":
      return e.v;
    case "star":
      throw new SqlError("* is only allowed as SELECT * or COUNT(*)", 0);
    case "col": {
      const key = e.name.toLowerCase();
      if (ctx.aliases?.has(key)) return ctx.aliases.get(key)!;
      if (!ctx.columns.has(key)) throw new SqlError(`no column named "${e.name}"`, 0);
      return ctx.row[key] ?? null;
    }
    case "un": {
      const v = evaluate(e.e, ctx);
      if (e.op === "-") {
        const n = numeric(v);
        return n === null ? null : -n;
      }
      const t = truthy(v);
      return t === null ? null : !t;
    }
    case "bin": {
      if (e.op === "AND") {
        const l = truthy(evaluate(e.l, ctx));
        if (l === false) return false;
        const r = truthy(evaluate(e.r, ctx));
        if (r === false) return false;
        return l === null || r === null ? null : true;
      }
      if (e.op === "OR") {
        const l = truthy(evaluate(e.l, ctx));
        if (l === true) return true;
        const r = truthy(evaluate(e.r, ctx));
        if (r === true) return true;
        return l === null || r === null ? null : false;
      }
      const l = evaluate(e.l, ctx);
      const r = evaluate(e.r, ctx);
      if (e.op === "||") return l === null || r === null ? null : String(l) + String(r);
      if (["+", "-", "*", "/", "%"].includes(e.op)) {
        const x = numeric(l);
        const y = numeric(r);
        if (x === null || y === null) return null;
        switch (e.op) {
          case "+":
            return x + y;
          case "-":
            return x - y;
          case "*":
            return x * y;
          case "/":
            return y === 0 ? null : x / y;
          default:
            return y === 0 ? null : x % y;
        }
      }
      const c = compare(l, r);
      if (c === null) return null;
      switch (e.op) {
        case "=":
          return c === 0;
        case "!=":
          return c !== 0;
        case "<":
          return c < 0;
        case "<=":
          return c <= 0;
        case ">":
          return c > 0;
        case ">=":
          return c >= 0;
      }
      throw new SqlError(`unknown operator ${e.op}`, 0);
    }
    case "in": {
      const v = evaluate(e.e, ctx);
      if (v === null) return null;
      let sawNull = false;
      for (const x of e.list) {
        const c = compare(v, evaluate(x, ctx));
        if (c === null) sawNull = true;
        else if (c === 0) return !e.not;
      }
      return sawNull ? null : e.not;
    }
    case "between": {
      const v = evaluate(e.e, ctx);
      const lo = compare(v, evaluate(e.lo, ctx));
      const hi = compare(v, evaluate(e.hi, ctx));
      if (lo === null || hi === null) return null;
      const inside = lo >= 0 && hi <= 0;
      return e.not ? !inside : inside;
    }
    case "like": {
      const v = evaluate(e.e, ctx);
      const p = evaluate(e.pat, ctx);
      if (v === null || p === null) return null;
      // LIKE ignores case, as in SQLite; ILIKE is accepted for people coming from Postgres
      const m = likeToRegex(String(p), true).test(String(v));
      return e.not ? !m : m;
    }
    case "isnull": {
      const v = evaluate(e.e, ctx);
      return e.not ? v !== null : v === null;
    }
    case "case": {
      const base = e.base ? evaluate(e.base, ctx) : null;
      for (const w of e.whens) {
        const hit = e.base ? compare(base, evaluate(w.when, ctx)) === 0 : truthy(evaluate(w.when, ctx)) === true;
        if (hit) return evaluate(w.then, ctx);
      }
      return e.else ? evaluate(e.else, ctx) : null;
    }
    case "fn": {
      if (AGGREGATES.has(e.name)) {
        if (!ctx.group) throw new SqlError(`${e.name}() is not allowed here`, 0);
        if (e.name === "COUNT" && e.star) return ctx.group.length;
        if (e.args.length !== 1 && e.name !== "GROUP_CONCAT") throw new SqlError(`${e.name}() takes one argument`, 0);
        let vals = ctx.group.map((row) => evaluate(e.args[0], { ...ctx, row, group: null })).filter((v) => v !== null) as Exclude<Value, null>[];
        if (e.distinct) {
          const seen = new Set<string>();
          vals = vals.filter((v) => {
            const k = typeof v + ":" + String(v);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
        switch (e.name) {
          case "COUNT":
            return vals.length;
          case "SUM": {
            const ns = vals.map(numeric).filter((x): x is number => x !== null);
            return ns.length ? ns.reduce((a, b) => a + b, 0) : null;
          }
          case "AVG": {
            const ns = vals.map(numeric).filter((x): x is number => x !== null);
            return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
          }
          case "MIN":
            return vals.length ? vals.reduce((a, b) => (sortCompare(b, a) < 0 ? b : a)) : null;
          case "MAX":
            return vals.length ? vals.reduce((a, b) => (sortCompare(b, a) > 0 ? b : a)) : null;
          case "GROUP_CONCAT": {
            const sep = e.args[1] ? String(evaluate(e.args[1], ctx) ?? ",") : ",";
            return vals.length ? vals.map(String).join(sep) : null;
          }
        }
      }
      const f = SCALAR[e.name];
      if (!f) throw new SqlError(`unknown function ${e.name}()`, 0);
      return f(e.args.map((a) => evaluate(a, ctx)));
    }
  }
}

function exprName(e: Expr): string | null {
  return e.k === "col" ? e.name.toLowerCase() : null;
}

export function execute(q: Select, tables: Map<string, SqlTable>): SqlResult {
  const t0 = performance.now();
  const table = tables.get(q.from);
  if (!table) throw new SqlError(`no table named "${q.from}"; try ${[...tables.keys()].join(", ")}`, 0);
  const columns = new Set(table.columns.map((c) => c.toLowerCase()));
  if (q.where && hasAggregate(q.where)) throw new SqlError("aggregates are not allowed in WHERE; use HAVING", 0);

  let rows = table.rows;
  if (q.where) rows = rows.filter((row) => truthy(evaluate(q.where!, { row, group: null, columns })) === true);

  const items = q.items === "*" ? table.columns.map((c) => ({ expr: { k: "col", name: c } as Expr, alias: null, text: c })) : q.items;
  const headers = items.map((it) => it.alias ?? (it.expr.k === "col" ? it.expr.name : it.text));
  const aliasKeys = items.map((it, i) => (it.alias ?? headers[i]).toLowerCase());
  const grouped = q.groupBy.length > 0 || items.some((it) => hasAggregate(it.expr)) || hasAggregate(q.having) || q.orderBy.some((o) => hasAggregate(o.expr));

  // GROUP BY may name an output alias or position
  const resolveRef = (e: Expr): Expr => {
    if (e.k === "lit" && typeof e.v === "number" && Number.isInteger(e.v)) {
      const it = items[e.v - 1];
      if (!it) throw new SqlError(`position ${e.v} is not in the SELECT list`, 0);
      return it.expr;
    }
    const name = exprName(e);
    if (name && !columns.has(name)) {
      const i = aliasKeys.indexOf(name);
      if (i >= 0) return items[i].expr;
    }
    return e;
  };

  type Out = { values: Value[]; keys: Value[] };
  const out: Out[] = [];
  const emit = (row: Row, group: Row[] | null) => {
    const ctx: Ctx = { row, group, columns };
    const values = items.map((it) => evaluate(it.expr, ctx));
    const aliases = new Map<string, Value>();
    aliasKeys.forEach((k, i) => {
      if (!columns.has(k) || items[i].alias) aliases.set(k, values[i]);
    });
    if (q.having && truthy(evaluate(q.having, { ...ctx, aliases })) !== true) return;
    const keys = q.orderBy.map((o) => {
      if (o.expr.k === "lit" && typeof o.expr.v === "number" && Number.isInteger(o.expr.v)) {
        if (o.expr.v < 1 || o.expr.v > values.length) throw new SqlError(`ORDER BY position ${o.expr.v} is not in the SELECT list`, 0);
        return values[o.expr.v - 1];
      }
      return evaluate(o.expr, { ...ctx, aliases });
    });
    out.push({ values, keys });
  };

  if (grouped) {
    const groupExprs = q.groupBy.map(resolveRef);
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = JSON.stringify(groupExprs.map((g) => evaluate(g, { row, group: null, columns })));
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(row);
    }
    // an aggregate over no rows still returns one row (COUNT(*) = 0)
    if (!groups.size && !q.groupBy.length) groups.set("[]", []);
    for (const g of groups.values()) emit(g[0] ?? {}, g);
  } else for (const row of rows) emit(row, null);

  let result = out;
  if (q.distinct) {
    const seen = new Set<string>();
    result = result.filter((o) => {
      const k = JSON.stringify(o.values);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (q.orderBy.length)
    result.sort((a, b) => {
      for (let i = 0; i < q.orderBy.length; i++) {
        const c = sortCompare(a.keys[i], b.keys[i]);
        if (c) return q.orderBy[i].desc ? -c : c;
      }
      return 0;
    });
  const total = result.length;
  const sliced = result.slice(q.offset, q.limit === null ? undefined : q.offset + q.limit);
  return { columns: headers, rows: sliced.map((o) => o.values), scanned: table.rows.length, total, ms: performance.now() - t0 };
}

export function runSql(sql: string, tables: Map<string, SqlTable>): SqlResult {
  return execute(parse(sql), tables);
}
