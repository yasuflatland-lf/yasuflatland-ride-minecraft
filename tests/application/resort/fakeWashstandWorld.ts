import { vi } from "vitest";
import type { WashstandWorld } from "../../../src/application/resort/ports/washstandWorld";
import type { FurnitureId } from "../../../src/domain/resort/ids";

export function fakeWashstandWorld(loaded: readonly FurnitureId[] = []) {
  return {
    setRunning: vi.fn<WashstandWorld["setRunning"]>(),
    loadedWashstands: vi.fn<WashstandWorld["loadedWashstands"]>(() => loaded),
  } satisfies WashstandWorld;
}
