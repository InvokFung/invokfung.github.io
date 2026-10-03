/**
 * A deliberately small runtime validator: just enough to check every client message
 * on the server (and in the worker) while deriving the static types from the same
 * declarations, so the validator and the TypeScript union can never drift apart.
 * Objects are strict: unknown keys are rejected rather than silently passed on.
 */

export interface Issue {
  readonly path: string;
  readonly message: string;
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: Issue };

export interface Schema<T> {
  readonly parse: (input: unknown, path?: string) => Result<T>;
}

export interface OptionalSchema<T> {
  readonly optional: Schema<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Shape = Record<string, Schema<unknown> | OptionalSchema<unknown>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type RequiredKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? never : K }[keyof S];
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never }[keyof S];
type InferShape<S extends Shape> = Simplify<
  { readonly [K in RequiredKeys<S>]: S[K] extends Schema<infer T> ? T : never } & {
    readonly [K in OptionalKeys<S>]?: S[K] extends OptionalSchema<infer T> ? T : never;
  }
>;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (path: string, message: string): Result<never> => ({ ok: false, issue: { path, message } });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function literal<const L extends string>(expected: L): Schema<L> {
  return { parse: (v, path = "$") => (v === expected ? ok(expected) : fail(path, `expected "${expected}"`)) };
}

export function string(opts: { min?: number; max: number; pattern?: RegExp }): Schema<string> {
  return {
    parse: (v, path = "$") => {
      if (typeof v !== "string") return fail(path, "expected a string");
      if (v.length < (opts.min ?? 0) || v.length > opts.max) return fail(path, `length must be ${opts.min ?? 0}..${opts.max}`);
      if (opts.pattern && !opts.pattern.test(v)) return fail(path, "invalid format");
      return ok(v);
    },
  };
}

export function int(min: number, max: number): Schema<number> {
  return {
    parse: (v, path = "$") =>
      typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? ok(v) : fail(path, `expected an integer in ${min}..${max}`),
  };
}

export function finite(): Schema<number> {
  return { parse: (v, path = "$") => (typeof v === "number" && Number.isFinite(v) ? ok(v) : fail(path, "expected a finite number")) };
}

export function oneOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return {
    parse: (v, path = "$") =>
      typeof v === "string" && (values as readonly string[]).includes(v) ? ok(v as T[number]) : fail(path, `expected one of ${values.join(", ")}`),
  };
}

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return { parse: (v, path = "$") => (v === null ? ok(null) : inner.parse(v, path)) };
}

export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return { optional: inner };
}

export function object<const S extends Shape>(shape: S): Schema<InferShape<S>> {
  const keys = Object.keys(shape);
  return {
    parse: (v, path = "$") => {
      if (!isRecord(v)) return fail(path, "expected an object");
      for (const key of Object.keys(v)) if (!(key in shape)) return fail(`${path}.${key}`, "unexpected field");
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const field = shape[key] as Schema<unknown> | OptionalSchema<unknown>;
        const present = key in v && v[key] !== undefined;
        if ("optional" in field) {
          if (!present) continue;
          const r = field.optional.parse(v[key], `${path}.${key}`);
          if (!r.ok) return r;
          out[key] = r.value;
        } else {
          const r = field.parse(v[key], `${path}.${key}`);
          if (!r.ok) return r;
          out[key] = r.value;
        }
      }
      return ok(out as InferShape<S>);
    },
  };
}

/** Discriminated union keyed by `type`; the member map doubles as the list of accepted message types. */
export function tagged<const M extends Record<string, Schema<{ readonly type: string }>>>(members: M): Schema<Infer<M[keyof M]>> {
  return {
    parse: (v, path = "$") => {
      if (!isRecord(v) || typeof v.type !== "string") return fail(`${path}.type`, "missing message type");
      if (!Object.hasOwn(members, v.type)) return fail(`${path}.type`, `unknown message type "${v.type.slice(0, 32)}"`);
      return (members[v.type] as Schema<Infer<M[keyof M]>>).parse(v, path);
    },
  };
}
