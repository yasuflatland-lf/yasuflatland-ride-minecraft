// The space check one feature hands another through bootstrap (ADR 0046, 0129).
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";

/** Whether the feature that returned this check holds `cell`. A pure read: it changes no block or entity. */
export type SpaceCheck = (dimensionId: DimensionId, cell: Cell) => boolean;
