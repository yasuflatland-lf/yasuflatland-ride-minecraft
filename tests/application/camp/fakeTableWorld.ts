import { vi } from "vitest";
import type { TableWorld } from "../../../src/application/camp/ports/table";
import { asTableId } from "../../../src/domain/camp/table";

export function fakeTableWorld(failSpawn = false) {
  return {
    itemsOnTable: vi.fn(() => 0),
    showOvenOnTop: vi.fn(),
    isAir: vi.fn<TableWorld["isAir"]>(() => true),
    isOwnBlock: vi.fn<TableWorld["isOwnBlock"]>(() => false),
    isVehicleSpace: vi.fn<TableWorld["isVehicleSpace"]>(() => false),
    hasTableNear: vi.fn<TableWorld["hasTableNear"]>(() => false),
    isCreative: vi.fn<TableWorld["isCreative"]>(() => false),
    consumeItem: vi.fn<TableWorld["consumeItem"]>(() => true),
    refund: vi.fn<TableWorld["refund"]>(),
    spawnTable: vi.fn<TableWorld["spawnTable"]>(() =>
      failSpawn ? undefined : asTableId("table"),
    ),
    dropItem: vi.fn(),
    removeTable: vi.fn(),
    showHitsLeft: vi.fn(),
  } satisfies TableWorld;
}
