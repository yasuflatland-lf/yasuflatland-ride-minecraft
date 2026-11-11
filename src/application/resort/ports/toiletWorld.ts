import type { FurnitureId } from "../../../domain/resort/ids";
import type { PlayerId } from "../../../domain/shared/ids";

export interface ToiletWorld {
  riderOf(id: FurnitureId): PlayerId | undefined;
  seat(id: FurnitureId, player: PlayerId): boolean;
  setLid(id: FurnitureId, open: boolean): void;
  setFlushing(id: FurnitureId, on: boolean): void;
  placeBeside(id: FurnitureId, player: PlayerId): void;
  showRefused(player: PlayerId, reason: "occupied" | "flushing"): void;
  loadedToilets(): readonly FurnitureId[];
}
