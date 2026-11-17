import { beforeEach, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { asWarpPointId } from "../../../src/domain/warp/ids";
import { parseWarpName } from "../../../src/domain/warp/warpName";
import { BedrockWarpFeedback } from "../../../src/infrastructure/warp/bedrock/bedrockWarpFeedback";
import { WARP_MESSAGE } from "../../../src/infrastructure/warp/messages";

const engine = vi.hoisted(() => ({
  getEntity: vi.fn(),
  setActionBar: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: { getEntity: engine.getEntity },
}));
const playerId = asPlayerId("player");
const homeName = parseWarpName("Home");
if (!homeName) throw new Error("Invalid fixture name");
const point = {
  id: asWarpPointId("warp-1"),
  name: homeName,
  owner: "Alex",
  dimension: asDimensionId("minecraft:overworld"),
  cell: { x: 0, y: 64, z: 0 },
};
const feedback = new BedrockWarpFeedback();
beforeEach(() => {
  vi.resetAllMocks();
  engine.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    isValid: true,
    onScreenDisplay: { setActionBar: engine.setActionBar },
  });
});
it.each([
  "registryUnreadable",
  "registryFull",
  "pointGone",
  "noPoints",
  "teleportFailed",
] as const)("translates %s for the requested player", (method) => {
  feedback[method](playerId, point);
  expect(engine.getEntity).toHaveBeenCalledWith(playerId);
  expect(engine.setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: WARP_MESSAGE[method],
    ...(method === "pointGone" ? { with: ["Home"] } : {}),
  });
});
it.each([
  undefined,
  { typeId: "minecraft:pig", isValid: true },
  { typeId: "minecraft:player", isValid: false },
])("ignores unavailable recipients", (entity) => {
  engine.getEntity.mockReturnValue(entity);
  feedback.registryUnreadable(playerId);
  feedback.registryFull(playerId);
  feedback.pointGone(playerId, point);
  feedback.noPoints(playerId);
  feedback.teleportFailed(playerId);
  expect(engine.setActionBar).not.toHaveBeenCalled();
});
