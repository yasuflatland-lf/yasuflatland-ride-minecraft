import type { LanternWorld } from "../../../src/application/camp/ports/lantern";
import type { TentId } from "../../../src/domain/camp/tent";

/** An in-memory LanternWorld: a tent is loaded while it has an entry in `lanterns`. */
export class FakeLanternWorld implements LanternWorld {
  readonly lanterns = new Map<TentId, boolean>();
  readonly set: { tentId: TentId; on: boolean }[] = [];

  lanternOf(tentId: TentId): boolean | undefined {
    return this.lanterns.get(tentId);
  }
  setLantern(tentId: TentId, on: boolean): void {
    this.set.push({ tentId, on });
    this.lanterns.set(tentId, on);
  }
}
