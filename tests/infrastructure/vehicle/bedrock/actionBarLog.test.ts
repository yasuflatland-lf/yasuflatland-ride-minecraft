import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { ActionBarLog } from "../../../../src/infrastructure/vehicle/bedrock/actionBarLog";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

describe("ActionBarLog", () => {
  beforeEach(() => vi.resetAllMocks());

  it("writes the text once to the requested player's action bar", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const setActionBar = vi.fn();
        game.getEntity.mockImplementation((id: string) =>
          id === "player"
            ? { typeId: "minecraft:player", onScreenDisplay: { setActionBar } }
            : undefined,
        );
        const log = new ActionBarLog(new EntityIndex(), () => 42);
        log.write(asPlayerId("player"), text);
        expect(setActionBar).toHaveBeenCalledExactlyOnceWith(text);
      }),
    );
  });

  it("ignores a player who is gone", () => {
    const log = new ActionBarLog(new EntityIndex(), () => 42);
    expect(() => log.write(asPlayerId("gone"), "message")).not.toThrow();
    game.getEntity.mockImplementation(() => {
      throw new Error("Player left");
    });
    expect(() => log.write(asPlayerId("gone"), "message")).not.toThrow();
  });

  it("ignores a throw from setActionBar", () => {
    game.getEntity.mockReturnValue({
      typeId: "minecraft:player",
      onScreenDisplay: {
        setActionBar: () => {
          throw new Error("Player left");
        },
      },
    });
    const log = new ActionBarLog(new EntityIndex(), () => 42);
    expect(() => log.write(asPlayerId("player"), "message")).not.toThrow();
  });
});

it("counts the quiet period from the last successful write to that player", () => {
  const player = asPlayerId("player");
  const setActionBar = vi.fn();
  game.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    onScreenDisplay: { setActionBar },
  });
  let tick = 42;
  const log = new ActionBarLog(new EntityIndex(), () => tick);
  expect(log.quietSince(player, tick)).toBe(true);
  log.write(player, "message");
  tick += 10;
  setActionBar.mockImplementationOnce(() => {
    throw new Error("Player left");
  });
  log.write(player, "failed");
  expect(log.quietSince(asPlayerId("another"), tick)).toBe(true);
  expect(log.quietSince(player, 101)).toBe(false);
  expect(log.quietSince(player, 102)).toBe(true);
});
