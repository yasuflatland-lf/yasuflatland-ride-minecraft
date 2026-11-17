import type { PlayerId } from "../../../domain/shared/ids";
import type { WarpPointId } from "../../../domain/warp/ids";
import type { WarpName } from "../../../domain/warp/warpName";
import type { WarpPoint } from "../../../domain/warp/warpPoint";

export interface WarpMenus {
  askName(
    playerId: PlayerId,
    current?: WarpName,
  ): Promise<
    { kind: "name"; name: WarpName } | { kind: "cancelled" } | { kind: "busy" }
  >;
  chooseWarp(
    playerId: PlayerId,
    page: {
      entries: readonly { point: WarpPoint; unverified: boolean }[];
      pageIndex: number;
      pageCount: number;
    },
  ): Promise<
    | { kind: "warp"; id: WarpPointId }
    | { kind: "page"; pageIndex: number }
    | { kind: "cancelled" }
    | { kind: "busy" }
  >;
}
