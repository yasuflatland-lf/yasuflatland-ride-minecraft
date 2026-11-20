import { vi } from "vitest";
import type { TableWorld } from "../../../src/application/camp/ports/table";

export function fakeTableWorld(): TableWorld {
  return {
    itemsOnTable: vi.fn(() => 0),
    showOvenOnTop: vi.fn(),
    isAir: vi.fn(() => true),
    isOwnBlock: vi.fn(() => false),
    isVehicleSpace: vi.fn(() => false),
    hasTableNear: vi.fn(() => false),
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    spawnTable: vi.fn(),
    dropItem: vi.fn(),
    removeTable: vi.fn(),
    showHitsLeft: vi.fn(),
  };
}
