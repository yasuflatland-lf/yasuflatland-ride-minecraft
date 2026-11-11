import { vi } from "vitest";
import type { ToiletWorld } from "../../../src/application/resort/ports/toiletWorld";
import type { FurnitureId } from "../../../src/domain/resort/ids";
import type { PlayerId } from "../../../src/domain/shared/ids";

export function fakeToiletWorld(loaded: readonly FurnitureId[] = []) {
  const riders = new Map<FurnitureId, PlayerId>();
  const world = {
    riderOf: vi.fn<ToiletWorld["riderOf"]>((id) => riders.get(id)),
    seat: vi.fn<ToiletWorld["seat"]>((id, player) => {
      riders.set(id, player);
      return true;
    }),
    setLid: vi.fn<ToiletWorld["setLid"]>(),
    setFlushing: vi.fn<ToiletWorld["setFlushing"]>(),
    placeBeside: vi.fn<ToiletWorld["placeBeside"]>(),
    showRefused: vi.fn<ToiletWorld["showRefused"]>(),
    loadedToilets: vi.fn<ToiletWorld["loadedToilets"]>(() => loaded),
  } satisfies ToiletWorld;
  return { world, riders };
}
