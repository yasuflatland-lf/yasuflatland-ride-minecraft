import { vi } from "vitest";
import type {
  ParasolTakeBackWorld,
  ParasolWorld,
} from "../../../src/application/resort/ports/parasolWorld";
import { asParasolId } from "../../../src/domain/resort/ids";
import type { Cell } from "../../../src/domain/shared/cells";

export function fakeParasolWorld() {
  return {
    isAir: vi.fn(() => true),
    isOwnBlock: vi.fn(() => false),
    isSolidTop: vi.fn(() => true),
    isVehicleSpace: vi.fn(() => false),
    isCampSpace: vi.fn(() => false),
    baseCellsNear: vi.fn((): Cell[] => []),
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    spawn: vi.fn(
      () => asParasolId("parasol") as ReturnType<ParasolWorld["spawn"]>,
    ),
    refund: vi.fn(),
    showBlocked: vi.fn(),
    layCeiling: vi.fn(),
    clearCeiling: vi.fn(),
    dropItem: vi.fn(),
    remove: vi.fn(),
    showRemaining: vi.fn(),
    showTaken: vi.fn(),
  } satisfies ParasolWorld & ParasolTakeBackWorld;
}
