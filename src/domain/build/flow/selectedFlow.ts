import type { Selection } from "../selection";
import type { BuildFlow, BuildStart } from "./state";
import type { Taps } from "./tapCells";

export type SelectedFlow = Extract<BuildFlow, { kind: "selected" }>;

type SelectionInput = {
  start: BuildStart;
  selection: Selection;
  taps: Taps;
};

export function confirmedSelection(
  input: SelectionInput & { freshEnd?: true },
): SelectedFlow {
  const { start, selection, taps, freshEnd } = input;
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
  });
}
