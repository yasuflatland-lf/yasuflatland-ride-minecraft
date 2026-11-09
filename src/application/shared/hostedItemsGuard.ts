import type { HostedKindPort } from "./ports/hostedKind";

/** Removes items whose table or Fire Pit is gone, with no drop (ADR 0185). */
export class HostedItemsGuard {
  constructor(private readonly kinds: readonly HostedKindPort[]) {}

  check(): void {
    for (const kind of this.kinds) {
      for (const id of kind.loaded()) {
        const host = kind.host(id);
        // Vehicle hosts use their own presence and driving rules (ADR 0200).
        if (host.kind === "ground" || host.kind === "vehicle") continue;
        // An unloaded host reads as missing, so only a loaded host area can prove it gone.
        if (kind.isHostAreaLoaded(id) && !kind.hostExists(host.id))
          kind.remove(id);
      }
    }
  }
}
