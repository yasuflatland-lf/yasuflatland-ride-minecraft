import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockPaidGroundCells } from "../../../src/infrastructure/shared/groundCells";
import { isOwnTypeId } from "../../../src/infrastructure/shared/identifiers";

const game = vi.hoisted(() => ({ getDimension: vi.fn(), getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

const dimension = asDimensionId("overworld");
const cell = { x: -2, y: 64, z: 8 };
const player = asPlayerId("player");
const item = "yasu_ride:test_item";
const adapter = new BedrockPaidGroundCells(() => false, item);
const getBlock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  game.getDimension.mockReturnValue({ getBlock });
});

it.each([
  ["minecraft:air", true, false],
  ["yasu_ride:tent_wall", false, true],
  ["minecraft:stone", false, false],
  [undefined, false, false],
] as const)("reads air and ownership for %s", (typeId, air, own) => {
  getBlock.mockReturnValue(typeId && { typeId, isAir: air });
  expect(adapter.isAir(dimension, cell)).toBe(air);
  expect(adapter.isOwnBlock(dimension, cell)).toBe(own);
  expect(game.getDimension).toHaveBeenCalledWith(dimension);
  expect(getBlock).toHaveBeenCalledWith(cell);
});

it.each(["unknown dimension", "unreadable cell"])(
  "returns false for an %s",
  (reason) => {
    const lookup =
      reason === "unknown dimension" ? game.getDimension : getBlock;
    lookup.mockImplementation(() => {
      throw new Error(reason);
    });
    expect(adapter.isAir(dimension, cell)).toBe(false);
    expect(adapter.isOwnBlock(dimension, cell)).toBe(false);
  },
);

it.each([item, "minecraft:stick"])(
  "checks the configured payment item against %s",
  (typeId) => {
    const container = {
      getItem: vi.fn(() => ({ typeId, amount: 1 })),
      setItem: vi.fn(),
    };
    game.getEntity.mockReturnValue({
      typeId: "minecraft:player",
      getComponent: () => ({ container }),
    });
    expect(adapter.consumeItem(player, 4)).toBe(typeId === item);
    expect(container.getItem).toHaveBeenCalledWith(4);
    expect(container.setItem.mock.calls).toEqual(
      typeId === item ? [[4, undefined]] : [],
    );
  },
);

it("treats a missing player as non-creative", () => {
  expect(adapter.isCreative(player)).toBe(false);
});

it("recognizes exactly the add-on namespace", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string(),
        fc.string().map((name) => `yasu_ride:${name}`),
      ),
      (id) => {
        expect(isOwnTypeId(id)).toBe(id.startsWith("yasu_ride:"));
      },
    ),
  );
});
