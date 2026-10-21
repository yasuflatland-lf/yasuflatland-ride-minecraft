import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../../src/domain/shared/ids";
import { BedrockBedWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockBedWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";

const game = vi.hoisted(() => ({
  world: {
    getEntity: vi.fn(),
    getTimeOfDay: vi.fn(),
    setTimeOfDay: vi.fn(),
    getDimension: vi.fn(),
  },
  system: { runTimeout: vi.fn() },
}));
vi.mock("@minecraft/server", () => ({
  world: game.world,
  system: game.system,
}));

function fixture() {
  const player = {
    id: "player",
    typeId: "minecraft:player",
    setSpawnPoint: vi.fn(),
    camera: { fade: vi.fn() },
    onScreenDisplay: { setActionBar: vi.fn() },
  };
  game.world.getEntity.mockImplementation((id: string) =>
    id === player.id ? player : undefined,
  );
  return { player, bed: new BedrockBedWorld(new EntityIndex()) };
}

describe("BedrockBedWorld (ADR 0092)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the time of day from the world", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23999 }), (time) => {
        const { bed } = fixture();
        game.world.getTimeOfDay.mockReturnValue(time);
        expect(bed.timeOfDay()).toBe(time);
      }),
    );
  });

  it("sets the player's spawn point to the bed cell in its dimension", () => {
    const { player, bed } = fixture();
    const dimension = { id: "minecraft:overworld" };
    game.world.getDimension.mockImplementation((id: string) =>
      id === "minecraft:overworld" ? dimension : undefined,
    );
    bed.setSpawnPoint(
      asPlayerId("player"),
      asDimensionId("minecraft:overworld"),
      { x: 1, y: 65, z: 2 },
    );
    expect(player.setSpawnPoint).toHaveBeenCalledExactlyOnceWith({
      dimension,
      x: 1,
      y: 65,
      z: 2,
    });
  });

  it("fades the screen and wakes up in the morning once it is black", () => {
    const { player, bed } = fixture();
    bed.sleep(asPlayerId("player"));
    expect(player.camera.fade).toHaveBeenCalledExactlyOnceWith({
      fadeColor: { red: 0, green: 0, blue: 0 },
      fadeTime: { fadeInTime: 0.5, holdTime: 1, fadeOutTime: 0.5 },
    });
    expect(game.system.runTimeout).toHaveBeenCalledOnce();
    const [wake, delay] = game.system.runTimeout.mock.calls[0] ?? [];
    expect(delay).toBe(10);
    expect(game.world.setTimeOfDay).not.toHaveBeenCalled();
    wake();
    expect(game.world.setTimeOfDay).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("does nothing for a missing player", () => {
    const { player, bed } = fixture();
    bed.sleep(asPlayerId("missing"));
    bed.setSpawnPoint(
      asPlayerId("missing"),
      asDimensionId("minecraft:overworld"),
      { x: 1, y: 65, z: 2 },
    );
    expect(() =>
      bed.showMessage(asPlayerId("missing"), "sleep_at_night"),
    ).not.toThrow();
    expect(player.camera.fade).not.toHaveBeenCalled();
    expect(game.system.runTimeout).not.toHaveBeenCalled();
    expect(player.setSpawnPoint).not.toHaveBeenCalled();
    expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
  });

  it("shows the night-only message on the action bar", () => {
    const { player, bed } = fixture();
    bed.showMessage(asPlayerId("player"), "sleep_at_night");
    expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith(
      { translate: "yasu_ride.message.sleep_at_night" },
    );
  });
});
