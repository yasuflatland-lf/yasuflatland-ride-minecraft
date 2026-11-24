import { SyncedValue } from "../shared/syncedValue";
import type { EngineCommand } from "./drive";

type CommandOutput = EngineCommand | readonly EngineCommand[];

interface CommandSource<Args extends unknown[]> {
  next(...args: Args): CommandOutput | undefined;
  resync(): void;
}

/** Registers command builders in send order and resets their latches together (ADR 0127). */
export class SyncedCommands<Values> {
  private readonly sources: CommandSource<[Values]>[] = [];

  /** An undefined selection leaves the latch untouched for passes that send only part of the group. */
  add<T>(
    select: (values: Values) => T | undefined,
    build: (value: T, values: Values) => CommandOutput,
    initial?: { readonly value: T },
  ): this {
    const latch = new SyncedValue(initial);
    this.sources.push({
      next(values) {
        const current = select(values);
        if (current === undefined) return undefined;
        const changed = latch.next(current);
        return changed === undefined ? undefined : build(changed, values);
      },
      resync: () => latch.resync(),
    });
    return this;
  }

  /** Includes a resend source whose send rules differ from change detection. */
  include<Args extends unknown[]>(
    source: CommandSource<Args>,
    select: (values: Values) => Args | undefined,
  ): this {
    this.sources.push({
      next(values) {
        const args = select(values);
        return args === undefined ? undefined : source.next(...args);
      },
      resync: () => source.resync(),
    });
    return this;
  }

  next(values: Values): EngineCommand[] {
    return this.sources.flatMap((source) => source.next(values) ?? []);
  }

  resync(): void {
    for (const source of this.sources) source.resync();
  }
}
