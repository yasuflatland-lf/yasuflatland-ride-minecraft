import type { ItemStack, Player } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../../src/infrastructure/shared/players";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  GameMode: { Creative: "Creative" },
  world: { getEntity: game.getEntity },
}));

const id = asPlayerId("-42");

function entity(typeId: string) {
  return Object.defineProperty({ typeId }, "isValid", {
    get: () => {
      throw new Error("isValid read");
    },
  });
}

beforeEach(() => {
  game.getEntity.mockReset();
});

describe("playerById", () => {
  it("returns the entity when it is a player, without reading isValid", () => {
    const player = entity("minecraft:player");
    game.getEntity.mockReturnValue(player);
    expect(playerById(id)).toBe(player);
    expect(game.getEntity).toHaveBeenCalledWith(id);
  });

  it("returns undefined for an entity of another type", () => {
    game.getEntity.mockReturnValue(entity("minecraft:zombie"));
    expect(playerById(id)).toBeUndefined();
  });

  it("returns undefined when the engine rejects the ID", () => {
    game.getEntity.mockImplementation(() => {
      throw new Error("Malformed entity ID");
    });
    expect(playerById(id)).toBeUndefined();
  });

  it("returns undefined for a missing entity", () => {
    game.getEntity.mockReturnValue(undefined);
    expect(playerById(id)).toBeUndefined();
  });
});

describe("isCreative", () => {
  it.each([
    { name: "Creative", valid: true, mode: "Creative", expected: true },
    { name: "Survival", valid: true, mode: "Survival", expected: false },
    { name: "missing", valid: undefined, mode: undefined, expected: false },
    { name: "departed", valid: false, mode: "Creative", expected: false },
  ])("checks a $name player", ({ valid, mode, expected }) => {
    const getGameMode = vi.fn(() => mode);
    const player =
      valid === undefined
        ? undefined
        : ({ isValid: valid, getGameMode } as unknown as Player);
    expect(isCreative(player)).toBe(expected);
    expect(getGameMode).toHaveBeenCalledTimes(valid ? 1 : 0);
  });
});

describe("consumeHeld", () => {
  it("takes exactly one matching item from the given slot", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom("matching", "different", "empty"),
        fc.oneof(fc.constant(1), fc.integer({ min: 2, max: 64 })),
        fc.integer({ min: 0, max: 35 }),
        (hasInventory, contents, amount, slot) => {
          const typeId = "minecraft:stick";
          const other = { typeId: "minecraft:stone", amount: 3 };
          const held =
            contents === "empty"
              ? undefined
              : {
                  typeId: contents === "matching" ? typeId : other.typeId,
                  amount,
                };
          const slots = Array.from({ length: 36 }, (_, index) =>
            index === slot ? held : { ...other },
          );
          const container = {
            getItem: (index: number) => slots[index] && { ...slots[index] },
            setItem: vi.fn((index: number, item: typeof held) => {
              slots[index] = item;
            }),
          };
          const player = {
            getComponent: (id: string) =>
              hasInventory && id === "minecraft:inventory"
                ? { container }
                : undefined,
          } as unknown as Player;
          const consumes = hasInventory && contents === "matching";
          const remaining = consumes
            ? amount === 1
              ? undefined
              : { typeId, amount: amount - 1 }
            : held;

          expect(consumeHeld(player, typeId, slot)).toBe(consumes);
          expect(slots).toEqual(
            slots.map((_, index) => (index === slot ? remaining : other)),
          );
          if (consumes)
            expect(container.setItem).toHaveBeenCalledExactlyOnceWith(
              slot,
              remaining,
            );
          else expect(container.setItem).not.toHaveBeenCalled();
        },
      ),
    );
  });
});

describe("giveOrDrop", () => {
  it.each([true, false])(
    "drops items that cannot be added (inventory present: %s)",
    (hasInventory) => {
      const added = { typeId: "minecraft:stick", amount: 1 } as ItemStack;
      const full = { typeId: "minecraft:stone", amount: 1 } as ItemStack;
      const addItem = vi.fn((item: ItemStack) =>
        item === full ? item : undefined,
      );
      const spawnItem = vi.fn();
      const location = { x: 0, y: 64, z: 0 };
      const player = {
        getComponent: () =>
          hasInventory ? { container: { addItem } } : undefined,
        dimension: { spawnItem },
        location,
      } as unknown as Player;
      giveOrDrop(player, [added, full]);
      expect(spawnItem.mock.calls).toEqual(
        (hasInventory ? [full] : [added, full]).map((item) => [item, location]),
      );
    },
  );
});
