import type { Vec3 } from "../../../shared/vec";
import type { TickContext } from "../../drive";

/** Reads all groups in one batch, in key order, and splits the result back by group. */
export function readBlockGroups<
  G extends Readonly<Record<string, readonly Vec3[]>>,
>(
  ctx: Pick<TickContext, "blockTypes">,
  groups: G,
): { readonly [K in keyof G]: readonly (string | undefined)[] } {
  const entries = Object.entries(groups);
  const batch = ctx.blockTypes(entries.flatMap(([, cells]) => cells));
  let start = 0;
  const result = Object.fromEntries(
    entries.map(([name, cells]) => {
      const end = start + cells.length;
      const group = batch.slice(start, end);
      start = end;
      return [name, group];
    }),
  );
  // fromEntries loses the relationship between the input and output keys.
  return result as unknown as {
    readonly [K in keyof G]: readonly (string | undefined)[];
  };
}
