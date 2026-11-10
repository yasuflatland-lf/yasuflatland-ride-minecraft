import { vi } from "vitest";
import type {
  FurnitureTakeBackWorld,
  FurnitureWorld,
} from "../../../src/application/resort/ports/furnitureWorld";
import type { FurnitureKind } from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";

export function fakeFurnitureWorld(kind: FurnitureKind) {
  return {
    isAir: vi.fn<FurnitureWorld["isAir"]>(() => true),
    isOwnBlock: vi.fn(() => false),
    isSolidTop: vi.fn<FurnitureWorld["isSolidTop"]>(() => true),
    isVehicleSpace: vi.fn<FurnitureWorld["isVehicleSpace"]>(() => false),
    isCampSpace: vi.fn<FurnitureWorld["isCampSpace"]>(() => false),
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    spawn: vi.fn(
      () => asFurnitureId("chair") as ReturnType<FurnitureWorld["spawn"]>,
    ),
    layTop: vi.fn(),
    clearTop: vi.fn(),
    blockAboveTop: vi.fn(() => false),
    refund: vi.fn(),
    showBlocked: vi.fn(),
    kindOf: vi.fn<FurnitureTakeBackWorld["kindOf"]>(() => kind),
    isOccupied: vi.fn(() => false),
    somethingOnTop: vi.fn(() => false),
    showRefused: vi.fn(),
    dropItem: vi.fn(),
    remove: vi.fn(),
    showHitsLeft: vi.fn(),
    showTaken: vi.fn(),
  } satisfies FurnitureWorld & FurnitureTakeBackWorld;
}
