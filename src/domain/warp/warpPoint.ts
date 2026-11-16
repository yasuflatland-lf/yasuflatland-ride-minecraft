import type { Cell } from "../shared/cells";
import type { DimensionId } from "../shared/ids";
import type { WarpPointId } from "./ids";
import type { WarpName } from "./warpName";

export type WarpPoint = Readonly<{
  id: WarpPointId;
  name: WarpName;
  owner: string;
  dimension: DimensionId;
  cell: Cell;
}>;
