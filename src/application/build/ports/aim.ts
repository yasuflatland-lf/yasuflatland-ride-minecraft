import type { Ray } from "../../../domain/build/aim/aim";
import type { Cell } from "../../../domain/shared/cells";
import type { PlayerId } from "../../../domain/shared/ids";

export interface AimReader {
  aim(
    playerId: PlayerId,
  ): { ray: Ray; block?: { cell: Cell; face: string } } | undefined;
}
