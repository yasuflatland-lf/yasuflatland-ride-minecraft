import type { ChairState } from "../../../domain/resort/beachChair";
import type { BeachChairId } from "../../../domain/resort/ids";
import type { PlayerId } from "../../../domain/shared/ids";

export interface BeachChairRiderWorld {
  state(id: BeachChairId): ChairState | undefined;
  riderOf(id: BeachChairId): PlayerId | undefined;
  seat(id: BeachChairId, player: PlayerId): boolean;
  playLounge(player: PlayerId): void;
  placeBeside(id: BeachChairId, player: PlayerId): void;
  showRefused(player: PlayerId, reason: "occupied" | "wrongForm"): void;
}
