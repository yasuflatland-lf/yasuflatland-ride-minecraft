import type { Selection } from "../selection";
import type { BuildFlow, BuildStart } from "./state";
import type { Taps } from "./tapCells";

export type SelectedFlow = Extract<BuildFlow, { kind: "selected" }>;

type SelectionInput = {
  start: BuildStart;
  selection: Selection;
  taps: Taps;
};

/** A selection the player has just confirmed: a fixed line or a confirmed height. */
export function confirmedSelection(
  input: SelectionInput & { freshEnd?: true },
): SelectedFlow {
  const { start, selection, taps, freshEnd } = input;
  // Preserve the replaced literals' property order for JSON.stringify in-game comparisons.
  return freshEnd
    ? Object.freeze({
        kind: "selected",
        start,
        freshEnd,
        menuLevel: "root",
        selection,
        taps,
      })
    : Object.freeze({
        kind: "selected",
        menuLevel: "root",
        selection,
        start,
        taps,
      });
}

/** A selection kept after a build action or a paste; not a new confirmation. */
export function keptSelection({
  start,
  selection,
  taps,
}: SelectionInput): SelectedFlow {
  return Object.freeze({
    kind: "selected",
    menuLevel: "root",
    selection,
    start,
    taps,
    rootShown: true,
  });
}
