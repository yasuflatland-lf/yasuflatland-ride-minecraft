import { beforeEach, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBuildPlayers } from "../../../src/infrastructure/build/bedrock/bedrockBuildPlayers";

const engine = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  GameMode: {},
  world: { getEntity: engine.getEntity },
}));
const id = asPlayerId("owner");
const players = new BedrockBuildPlayers();
function player() {
  return {
    typeId: "minecraft:player",
    isValid: true,
    dimension: { id: "minecraft:overworld" },
    location: { x: -1.2, y: 64.9, z: 3.8 },
    getComponent: vi.fn(() => undefined as unknown),
    teleport: vi.fn(),
  };
}
beforeEach(() => engine.getEntity.mockReset());
it("reads floored feet and teleports to their horizontal center without changing rotation", () => {
  const p = player();
  engine.getEntity.mockReturnValue(p);
  expect(players.occupantOf(id)).toEqual({
    dimensionId: "minecraft:overworld",
    feet: { x: -2, y: 64, z: 3 },
  });
  expect(p.getComponent).toHaveBeenCalledWith("minecraft:riding");
  players.moveTo(id, { x: -2, y: 70, z: 3 });
  expect(p.teleport).toHaveBeenCalledExactlyOnceWith({
    x: -1.5,
    y: 70,
    z: 3.5,
  });
});
it("does not read or move missing players, invalid handles, nonplayers, or riders", () => {
  const rider = player();
  rider.getComponent.mockReturnValue({});
  for (const p of [
    undefined,
    { ...player(), isValid: false },
    { ...player(), typeId: "minecraft:pig" },
    rider,
  ]) {
    engine.getEntity.mockReturnValue(p);
    expect(players.occupantOf(id)).toBeUndefined();
    players.moveTo(id, { x: 0, y: 64, z: 0 });
    if (p) expect(p.teleport).not.toHaveBeenCalled();
  }
});
