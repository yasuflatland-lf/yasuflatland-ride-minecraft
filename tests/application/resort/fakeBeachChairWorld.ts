import { vi } from "vitest";
import type {
  BeachChairTakeBackWorld,
  BeachChairWorld,
} from "../../../src/application/resort/ports/beachChairWorld";
import { asBeachChairId } from "../../../src/domain/resort/ids";

export function fakeBeachChairWorld() {
  return {
    isAir: vi.fn<BeachChairWorld["isAir"]>(() => true),
    isOwnBlock: vi.fn(() => false),
    isSolidTop: vi.fn<BeachChairWorld["isSolidTop"]>(() => true),
    isVehicleSpace: vi.fn<BeachChairWorld["isVehicleSpace"]>(() => false),
    isCampSpace: vi.fn<BeachChairWorld["isCampSpace"]>(() => false),
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    spawn: vi.fn(
      () => asBeachChairId("chair") as ReturnType<BeachChairWorld["spawn"]>,
    ),
    refund: vi.fn(),
    showBlocked: vi.fn(),
    state: vi.fn<BeachChairTakeBackWorld["state"]>(() => ({
      form: "chair",
      occupied: false,
      somethingOnTop: false,
    })),
    showRefused: vi.fn(),
    dropItem: vi.fn(),
    remove: vi.fn(),
    showRemaining: vi.fn(),
    showTaken: vi.fn(),
  } satisfies BeachChairWorld & BeachChairTakeBackWorld;
}
