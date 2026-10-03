// A small SQL dialect, parsed by hand: SELECT [DISTINCT] … FROM one table
// [WHERE] [GROUP BY] [HAVING] [ORDER BY] [LIMIT [OFFSET]]. Tokenizer, then
// recursive descent with the usual precedence:
//   OR < AND < NOT < comparison / IS / IN / LIKE / BETWEEN < || < + - < * / % < unary.

export type Value = string | number | boolean | null;

export type Expr =
  | { k: "lit"; v: Value }
  | { k: "col"; name: string }
  | { k: "star" }
  | { k: "un"; op: "-" | "NOT"; e: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "fn"; name: string; args: Expr[]; distinct: boolean; star: boolean }
  | { k: "in"; e: Expr; list: Expr[]; not: boolean }
  | { k: "between"; e: Expr; lo: Expr; hi: Expr; not: boolean }
  | { k: "like"; e: Expr; pat: Expr; not: boolean; ci: boolean }
  | { k: "isnull"; e: Expr; not: boolean }
  | { k: "case"; base: Expr | null; whens: { when: Expr; then: Expr }[]; else: Expr | null };

export interface SelectItem {
  expr: Expr;
  alias: string | null;
  /** The text the user wrote, for the column header. */
  text: string;
}

export interface Select {
  distinct: boolean;
  items: SelectItem[] | "*";
  from: string;
  where: Expr | null;
  groupBy: Expr[];
  having: Expr | null;
  orderBy: { expr: Expr; desc: boolean }[];
  limit: number | null;
  offset: number;
}

export class SqlError extends Error {
  constructor(
    message: string,
    public at: number,
  ) {
    super(message);
  }
}

type TokKind = "id" | "qid" | "num" | "str" | "op" | "eof";
interface Tok {
  kind: TokKind;
  text: string;
  /** Upper-cased for identifiers, so keywords compare cheaply. */
  up: string;
  at: number;
  end: number;
}

const KEYWORDS = new Set([
  "SELECT", "DISTINCT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC", "LIMIT", "OFFSET", "AS",
  "AND", "OR", "NOT", "IN", "IS", "NULL", "LIKE", "ILIKE", "BETWEEN", "TRUE", "FALSE", "CASE", "WHEN", "THEN", "ELSE", "END",
]);

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "-" && src[i + 1] === "-") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    const start = i;
    if (/[A-Za-z_]/.test(c)) {
      while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
      const text = src.slice(start, i);
      out.push({ kind: "id", text, up: text.toUpperCase(), at: start, end: i });
      continue;
    }
    if (c === '"' || c === "`") {
      const close = c;
      i++;
      let text = "";
      while (i < n && src[i] !== close) text += src[i++];
      if (i >= n) throw new SqlError("unterminated quoted name", start);
      i++;
      out.push({ kind: "qid", text, up: text.toUpperCase(), at: start, end: i });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      while (i < n && /[0-9]/.test(src[i])) i++;
      if (src[i] === "." && /[0-9]/.test(src[i + 1] ?? "")) {
        i++;
        while (i < n && /[0-9]/.test(src[i])) i++;
      }
      if (/[eE]/.test(src[i] ?? "") && /[-+0-9]/.test(src[i + 1] ?? "")) {
        i += 2;
        while (i < n && /[0-9]/.test(src[i])) i++;
      }
      const text = src.slice(start, i);
      out.push({ kind: "num", text, up: text, at: start, end: i });
      continue;
    }
    if (c === "'") {
      i++;
      let text = "";
      for (;;) {
        if (i >= n) throw new SqlError("unterminated string", start);
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            text += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        text += src[i++];
      }
      out.push({ kind: "str", text, up: text, at: start, end: i });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>", "!=", "||", "=="].includes(two)) {
      i += 2;
      out.push({ kind: "op", text: two, up: two, at: start, end: i });
      continue;
    }
    if ("=<>+-*/%(),.;".includes(c)) {
      i++;
      out.push({ kind: "op", text: c, up: c, at: start, end: i });
      continue;
    }
    throw new SqlError(`unexpected character "${c}"`, i);
  }
  out.push({ kind: "eof", text: "", up: "", at: n, end: n });
  return out;
}

export function parse(src: string): Select {
  const toks = tokenize(src);
  let p = 0;
  const peek = (o = 0) => toks[Math.min(p + o, toks.length - 1)];
  const isKw = (kw: string, o = 0) => peek(o).kind === "id" && peek(o).up === kw;
  const isOp = (op: string) => peek().kind === "op" && peek().text === op;
  const fail = (msg: string, t = peek()): never => {
    throw new SqlError(t.kind === "eof" ? `${msg}, but the query ended` : `${msg}, found "${t.text}"`, t.at);
  };
  const kw = (k: string) => {
    if (!isKw(k)) fail(`expected ${k}`);
    p++;
  };
  const op = (o: string) => {
    if (!isOp(o)) fail(`expected "${o}"`);
    p++;
  };
  const acceptKw = (k: string) => (isKw(k) ? (p++, true) : false);
  const acceptOp = (o: string) => (isOp(o) ? (p++, true) : false);

  const ident = (): string => {
    const t = peek();
    if (t.kind === "qid") {
      p++;
      return t.text;
    }
    if (t.kind === "id" && !KEYWORDS.has(t.up)) {
      p++;
      return t.text;
    }
    return fail("expected a name");
  };

  const expr = (): Expr => or();
  const or = (): Expr => {
    let l = and();
    while (acceptKw("OR")) l = { k: "bin", op: "OR", l, r: and() };
    return l;
  };
  const and = (): Expr => {
    let l = not();
    while (acceptKw("AND")) l = { k: "bin", op: "AND", l, r: not() };
    return l;
  };
  const not = (): Expr => (acceptKw("NOT") ? { k: "un", op: "NOT", e: not() } : comparison());
  const comparison = (): Expr => {
    const l = concat();
    const t = peek();
    if (t.kind === "op" && ["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(t.text)) {
      p++;
      const o = t.text === "==" ? "=" : t.text === "<>" ? "!=" : t.text;
      return { k: "bin", op: o, l, r: concat() };
    }
    if (acceptKw("IS")) {
      const neg = acceptKw("NOT");
      kw("NULL");
      return { k: "isnull", e: l, not: neg };
    }
    const neg = isKw("NOT") && (isKw("IN", 1) || isKw("LIKE", 1) || isKw("ILIKE", 1) || isKw("BETWEEN", 1)) ? (p++, true) : false;
    if (acceptKw("IN")) {
      op("(");
      const list: Expr[] = [expr()];
      while (acceptOp(",")) list.push(expr());
      op(")");
      return { k: "in", e: l, list, not: neg };
    }
    if (isKw("LIKE") || isKw("ILIKE")) {
      const ci = peek().up === "ILIKE";
      p++;
      return { k: "like", e: l, pat: concat(), not: neg, ci };
    }
    if (acceptKw("BETWEEN")) {
      const lo = concat();
      kw("AND");
      return { k: "between", e: l, lo, hi: concat(), not: neg };
    }
    if (neg) fail("expected IN, LIKE or BETWEEN after NOT");
    return l;
  };
  const concat = (): Expr => {
    let l = additive();
    while (acceptOp("||")) l = { k: "bin", op: "||", l, r: additive() };
    return l;
  };
  const additive = (): Expr => {
    let l = multiplicative();
    for (;;) {
      if (acceptOp("+")) l = { k: "bin", op: "+", l, r: multiplicative() };
      else if (acceptOp("-")) l = { k: "bin", op: "-", l, r: multiplicative() };
      else return l;
    }
  };
  const multiplicative = (): Expr => {
    let l = unary();
    for (;;) {
      if (acceptOp("*")) l = { k: "bin", op: "*", l, r: unary() };
      else if (acceptOp("/")) l = { k: "bin", op: "/", l, r: unary() };
      else if (acceptOp("%")) l = { k: "bin", op: "%", l, r: unary() };
      else return l;
    }
  };
  const unary = (): Expr => {
    if (acceptOp("-")) return { k: "un", op: "-", e: unary() };
    if (acceptOp("+")) return unary();
    return primary();
  };
  const primary = (): Expr => {
    const t = peek();
    if (t.kind === "num") {
      p++;
      return { k: "lit", v: Number(t.text) };
    }
    if (t.kind === "str") {
      p++;
      return { k: "lit", v: t.text };
    }
    if (acceptOp("(")) {
      const e = expr();
      op(")");
      return e;
    }
    if (t.kind === "op" && t.text === "*") {
      p++;
      return { k: "star" };
    }
    if (t.kind === "id") {
      if (acceptKw("NULL")) return { k: "lit", v: null };
      if (acceptKw("TRUE")) return { k: "lit", v: true };
      if (acceptKw("FALSE")) return { k: "lit", v: false };
      if (acceptKw("CASE")) {
        const base = isKw("WHEN") ? null : expr();
        const whens: { when: Expr; then: Expr }[] = [];
        while (acceptKw("WHEN")) {
          const when = expr();
          kw("THEN");
          whens.push({ when, then: expr() });
        }
        if (!whens.length) fail("expected WHEN");
        const otherwise = acceptKw("ELSE") ? expr() : null;
        kw("END");
        return { k: "case", base, whens, else: otherwise };
      }
      if (peek(1).kind === "op" && peek(1).text === "(" && !KEYWORDS.has(t.up)) {
        p += 2;
        const name = t.up;
        if (acceptOp(")")) return { k: "fn", name, args: [], distinct: false, star: false };
        if (isOp("*") && peek(1).kind === "op" && peek(1).text === ")") {
          p += 2;
          return { k: "fn", name, args: [], distinct: false, star: true };
        }
        const distinct = acceptKw("DISTINCT");
        const args = [expr()];
        while (acceptOp(",")) args.push(expr());
        op(")");
        return { k: "fn", name, args, distinct, star: false };
      }
    }
    if (t.kind === "id" || t.kind === "qid") {
      const name = ident();
      // table.column: the table name is accepted and ignored (one table per query)
      if (acceptOp(".")) return { k: "col", name: ident() };
      return { k: "col", name };
    }
    return fail("expected a value, a column or an expression");
  };

  const intLit = (what: string): number => {
    const t = peek();
    if (t.kind !== "num" || !/^\d+$/.test(t.text)) fail(`expected a whole number after ${what}`);
    p++;
    return Number(t.text);
  };

  kw("SELECT");
  const distinct = acceptKw("DISTINCT");
  let items: SelectItem[] | "*";
  if (isOp("*") && (isKw("FROM", 1) || peek(1).kind === "eof")) {
    p++;
    items = "*";
  } else {
    items = [];
    do {
      const start = peek().at;
      const e = expr();
      const text = src.slice(start, toks[p - 1].end).trim();
      let alias: string | null = null;
      if (acceptKw("AS")) alias = ident();
      else if (peek().kind === "qid" || (peek().kind === "id" && !KEYWORDS.has(peek().up))) alias = ident();
      items.push({ expr: e, alias, text });
    } while (acceptOp(","));
  }
  kw("FROM");
  const from = ident().toLowerCase();
  const where = acceptKw("WHERE") ? expr() : null;
  const groupBy: Expr[] = [];
  if (acceptKw("GROUP")) {
    kw("BY");
    do groupBy.push(expr());
    while (acceptOp(","));
  }
  const having = acceptKw("HAVING") ? expr() : null;
  const orderBy: { expr: Expr; desc: boolean }[] = [];
  if (acceptKw("ORDER")) {
    kw("BY");
    do {
      const e = expr();
      const desc = acceptKw("DESC") ? true : (acceptKw("ASC"), false);
      orderBy.push({ expr: e, desc });
    } while (acceptOp(","));
  }
  let limit: number | null = null;
  let offset = 0;
  if (acceptKw("LIMIT")) {
    limit = intLit("LIMIT");
    if (acceptKw("OFFSET")) offset = intLit("OFFSET");
    else if (acceptOp(",")) {
      // LIMIT offset, count (MySQL and SQLite)
      offset = limit;
      limit = intLit("LIMIT");
    }
  }
  acceptOp(";");
  if (peek().kind !== "eof") fail("expected the end of the query");
  return { distinct, items, from, where, groupBy, having, orderBy, limit, offset };
}
