// Runs one step per item so that a failure in one item does not stop the others.
import type { Logger } from "./ports/logger";

/**
 * Runs `fn`. When it throws, logs `${label}: ${error}` as a warning and
 * returns false; returns true on success.
 * A label thunk lets `forEachIsolated` build labels only for failing items.
 */
export function attempt(
  fn: () => void,
  log: Logger,
  label: string | (() => string),
): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    log.warn(`${typeof label === "string" ? label : label()}: ${e}`);
    return false;
  }
}

/**
 * Calls `fn` for each item in order. When `fn` throws, it logs
 * `${label(item)}: ${error}` as a warning and moves on to the next item.
 */
export function forEachIsolated<T>(
  items: Iterable<T>,
  fn: (item: T) => void,
  log: Logger,
  label: (item: T) => string,
): void {
  for (const item of items) {
    // The label is built lazily so a succeeding item never pays for it.
    attempt(
      () => fn(item),
      log,
      () => label(item),
    );
  }
}
