import type { FurnitureId } from "../../domain/resort/ids";
import type { ToiletState } from "../../domain/resort/toiletShow";
import type { WashstandState } from "../../domain/resort/washstandShow";

export class ShowStates {
  readonly toilets = new Map<FurnitureId, ToiletState>();
  readonly washstands = new Map<FurnitureId, WashstandState>();

  retainToilets(loaded: readonly FurnitureId[]): void {
    retainLoaded(this.toilets, loaded);
  }

  retainWashstands(loaded: readonly FurnitureId[]): void {
    retainLoaded(this.washstands, loaded);
  }
}

function retainLoaded<State>(
  states: Map<FurnitureId, State>,
  loaded: readonly FurnitureId[],
): void {
  const present = new Set(loaded);
  for (const id of states.keys()) if (!present.has(id)) states.delete(id);
}
