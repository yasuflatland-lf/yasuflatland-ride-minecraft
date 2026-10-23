// Each loaded tent's flaps, rebuilt from its float properties after /reload or a restart (ADR 0132).
import type { Entity } from "@minecraft/server";
import { TentFlaps } from "../../../domain/camp/flaps";
import { asTentId, type TentId } from "../../../domain/camp/tent";
import { TENT_FLAP_PROPERTY } from "../identifiers";

export class TentFlapStore {
  private readonly byTent = new Map<TentId, TentFlaps>();

  /** The tent's flaps, built once from tent.getProperty(TENT_FLAP_PROPERTY[flap]) for each flap. */
  flapsOf(tent: Entity): TentFlaps {
    const id = asTentId(tent.id);
    let flaps = this.byTent.get(id);
    if (!flaps) {
      flaps = new TentFlaps((flap) =>
        tent.getProperty(TENT_FLAP_PROPERTY[flap]),
      );
      this.byTent.set(id, flaps);
    }
    return flaps;
  }

  forget(tentId: TentId): void {
    this.byTent.delete(tentId);
  }

  /** Drops the flaps of every tent not in `live`. */
  forgetGone(live: ReadonlySet<TentId>): void {
    for (const id of this.byTent.keys())
      if (!live.has(id)) this.byTent.delete(id);
  }
}
