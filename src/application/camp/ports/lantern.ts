// Port for switching a tent's lantern; implemented in the infrastructure layer (ADR 0012).
import type { TentId } from "../../../domain/camp/tent";

export interface LanternWorld {
  /** Whether the tent's lantern is on; undefined when the tent is not loaded or gone. */
  lanternOf(tentId: TentId): boolean | undefined;
  /** Turns the lantern on or off and plays the switch's click at the tent. */
  setLantern(tentId: TentId, on: boolean): void;
}
