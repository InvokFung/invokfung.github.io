/**
 * localStorage behind try/catch. Storage can be missing or throw (private
 * windows, blocked site data, quota); the app then keeps working from memory
 * and says progress will not be kept.
 */
export interface SafeStorage {
  readonly persistent: boolean;
  read<T>(key: string, fallback: T): T;
  write(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export function createStorage(backend: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): SafeStorage {
  const memory = new Map<string, string>();
  let persistent = false;
  try {
    if (backend) {
      const probe = "__studio_probe__";
      backend.setItem(probe, "1");
      backend.removeItem(probe);
      persistent = true;
    }
  } catch {
    persistent = false;
  }
  const get = (k: string) => {
    if (persistent) {
      try {
        return backend!.getItem(k);
      } catch {
        /* fall through to memory */
      }
    }
    return memory.get(k) ?? null;
  };
  return {
    get persistent() {
      return persistent;
    },
    read<T>(key: string, fallback: T): T {
      const raw = get(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      const raw = JSON.stringify(value);
      memory.set(key, raw);
      if (!persistent) return false;
      try {
        backend!.setItem(key, raw);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        backend?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const storage = createStorage(browserStorage());
