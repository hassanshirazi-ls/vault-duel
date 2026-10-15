// Key-value storage behind try/catch (ARCHITECTURE.md §16). Private mode, quota errors and disabled storage all
// degrade to "nothing saved" instead of crashing the app. Tests use memoryStorage().
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export function browserStorage(): KV {
  return {
    get(key) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        // nothing to do: the key stays
      }
    },
  };
}

export function memoryStorage(): KV & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set(key, value) {
      data.set(key, value);
      return true;
    },
    remove(key) {
      data.delete(key);
    },
  };
}

/** Parses stored JSON; null for a missing key or corrupt text. */
export function getJson(kv: KV, key: string): unknown {
  const text = kv.get(key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
