import { beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  system: {
    afterEvents: { scriptEventReceive: { subscribe: harness.subscribe } },
  },
}));

const probeId = "yasu_ride_test:cutout_probe";
const oldProbe = { remove: vi.fn() };
const spawned = { setRotation: vi.fn() };
const dimension = { getEntities: vi.fn(), spawnEntity: vi.fn() };
const player = {
  typeId: "minecraft:player",
  dimension,
  location: { x: 10, y: 64, z: 20 },
  getRotation: () => ({ x: 80, y: 90 }),
  sendMessage: vi.fn(),
};
let receive: (event: { id: string; sourceEntity?: unknown }) => void;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  dimension.getEntities.mockReturnValue([oldProbe]);
  dimension.spawnEntity.mockReturnValue(spawned);
  await import("../../src/test-pack/cutoutProbe");
  receive = harness.subscribe.mock.calls[0]?.[0];
});

it("ignores unrelated events and sources that are not players", () => {
  receive({ id: "unrelated", sourceEntity: player });
  receive({ id: probeId });
  receive({ id: probeId, sourceEntity: { typeId: "minecraft:cow" } });
  expect(dimension.getEntities).not.toHaveBeenCalled();
  expect(dimension.spawnEntity).not.toHaveBeenCalled();
});

it("replaces probes in the player's dimension and faces the new probe toward the player", () => {
  receive({ id: probeId, sourceEntity: player });
  expect(dimension.getEntities).toHaveBeenCalledExactlyOnceWith({
    type: probeId,
  });
  expect(oldProbe.remove).toHaveBeenCalledOnce();
  expect(dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(probeId, {
    x: 7,
    y: 64,
    z: 20,
  });
  expect(oldProbe.remove.mock.invocationCallOrder[0]).toBeLessThan(
    dimension.spawnEntity.mock.invocationCallOrder[0] as number,
  );
  expect(spawned.setRotation).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 270 });
  expect(player.sendMessage).toHaveBeenCalledWith(
    expect.stringContaining("PC and mobile (touch)"),
  );
});

it("reports spawn failures to the player", () => {
  dimension.spawnEntity.mockImplementation(() => {
    throw new Error("unavailable");
  });
  receive({ id: probeId, sourceEntity: player });
  expect(player.sendMessage).toHaveBeenCalledExactlyOnceWith(
    "[cutout] Could not spawn the probe: Error: unavailable",
  );
});
