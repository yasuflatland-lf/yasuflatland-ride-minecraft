import type { FurnitureId } from "../../../domain/resort/ids";

export interface WashstandWorld {
  setRunning(id: FurnitureId, on: boolean): void;
  loadedWashstands(): readonly FurnitureId[];
}
