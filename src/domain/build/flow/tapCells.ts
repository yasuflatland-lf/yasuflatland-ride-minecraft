import type { Cell } from "../../shared/cells";

/** The two tapped cells of a selection. The first tap need not be the minimum corner. */
export type Taps = Readonly<{ from: Cell; to: Cell }>;
