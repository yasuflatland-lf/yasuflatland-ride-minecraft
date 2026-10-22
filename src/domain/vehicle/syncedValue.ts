/**
 * Remembers the last value a drive passed for one entity property, so the
 * drive sends it only when it changes. A failed send calls resync so the next
 * tick sends the value again.
 * Unless primed with a known entity value, the first call sends, so a
 * vehicle rebuilt after /reload overwrites values left on the entity
 * (ADR 0026, 0033, 0059).
 */
export class SyncedValue<T> {
  private sent: T | undefined;
  // A separate flag, because undefined can be a real value of T.
  private primed = false;

  constructor(initial?: { readonly value: T }) {
    this.primed = initial !== undefined;
    this.sent = initial?.value;
  }

  resync(): void {
    this.primed = false;
  }

  /** The value to send this tick, or undefined when the entity already has it. */
  next(value: T): T | undefined {
    const changed = !this.primed || value !== this.sent;
    this.primed = true;
    this.sent = value;
    return changed ? value : undefined;
  }
}
