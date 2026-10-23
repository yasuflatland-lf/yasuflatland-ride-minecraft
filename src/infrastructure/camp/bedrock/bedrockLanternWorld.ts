// Implements LanternWorld with @minecraft/server (ADR 0012).
import type { LanternWorld } from "../../../application/camp/ports/lantern";
import type { TentId } from "../../../domain/camp/tent";
import { SWITCH_CLICK_SOUND, TENT_LANTERN_PROPERTY } from "../identifiers";
import { isLanternOn, tentEntityOf } from "./tentEntity";

export class BedrockLanternWorld implements LanternWorld {
  lanternOf(tentId: TentId): boolean | undefined {
    const tent = tentEntityOf(tentId);
    return tent ? isLanternOn(tent) : undefined;
  }

  setLantern(tentId: TentId, on: boolean): void {
    const tent = tentEntityOf(tentId);
    if (!tent) return;
    tent.setProperty(TENT_LANTERN_PROPERTY, on);
    tent.dimension.playSound(SWITCH_CLICK_SOUND, tent.location);
  }
}
