// Runs one step per item so that a failure in one item does not stop the others.
import type { Logger } from "./ports";

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
    try {
      fn(item);
    } catch (e) {
      log.warn(`${label(item)}: ${e}`);
    }
  }
}
