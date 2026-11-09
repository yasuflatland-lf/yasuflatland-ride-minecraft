import type { ChairForm, ChairState } from "../../../domain/resort/beachChair";
import type { BeachChairId } from "../../../domain/resort/ids";
import type { PlayerId } from "../../../domain/shared/ids";

export interface BeachChairFormWorld {
  state(id: BeachChairId): ChairState | undefined;
  setForm(id: BeachChairId, form: ChairForm): void;
  showRefused(player: PlayerId, reason: "occupied" | "somethingOnTop"): void;
}
