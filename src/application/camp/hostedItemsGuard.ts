import type { HostedKindPort } from "./ports/hostedKind";

/** Removes items whose table or Fire Pit is gone, with no drop (ADR 0185). */
export class HostedItemsGuard {
  constructor(private readonly kinds: readonly HostedKindPort[]) {}

  check(): void {
    for (const kind of this.kinds) {
      for (const id of kind.loaded()) {
        const host = kind.host(id);
        if (host.kind === "ground") continue;
        // An unloaded host reads as missing, so only a loaded area can prove it gone.
        if (kind.isHostAreaLoaded(id) && !kind.hostExists(host.id))
          kind.remove(id);
      }
    }
  }
}
