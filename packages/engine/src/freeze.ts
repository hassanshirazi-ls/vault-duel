// Deep freeze (D-147). Freezing does not depend on key order, so iterating own property values
// is safe here; this file has the one lint exception for Object.values in the engine.

/** Recursively freezes a plain value (objects and arrays) and returns it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
