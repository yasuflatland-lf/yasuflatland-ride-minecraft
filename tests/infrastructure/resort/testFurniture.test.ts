import { expect, it, vi } from "vitest";
import { TakeBackFurniture } from "../../../src/application/resort/takeBackFurniture";
import type { HostedKindId } from "../../../src/application/shared/ports/hostedItem";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { BedrockFurnitureWorld } from "../../../src/infrastructure/resort/bedrock/bedrockFurnitureWorld";
import { TEST_FURNITURE_TOP } from "../../../src/infrastructure/resort/identifiers";
import { registerTestFurniture } from "../../../src/infrastructure/resort/testHooks/testFurniture";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";

const game = vi.hoisted(() => ({
  subscribe: vi.fn(),
  sendScriptEvent: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server" },
  system: {
    afterEvents: { scriptEventReceive: { subscribe: game.subscribe } },
    sendScriptEvent: game.sendScriptEvent,
  },
  world: { getDimension: () => ({ id: "overworld" }) },
}));

it("forwards a tabletop placement event only for a registered hosted kind", () => {
  const deps = {
    topHosts: new TopHostRegistry(),
    isVehicleSpace: () => false,
    isCampSpace: () => false,
  };
  const adapter = new BedrockFurnitureWorld(deps);
  vi.spyOn(adapter, "ownerAt").mockReturnValue(asFurnitureId("table"));
  registerTestFurniture(adapter, new TakeBackFurniture(adapter), deps);
  const receive = game.subscribe.mock.calls[0]?.[0];
  const event = {
    sourceType: "Server",
    id: TEST_FURNITURE_TOP,
    message: "test_item 0 64 1",
  };
  receive(event);
  expect(game.sendScriptEvent).not.toHaveBeenCalled();
  deps.topHosts.registerHosted({
    kind: "test_item" as HostedKindId,
    entityTypeId: "test:item",
    hostProperty: "test:host",
    footprint: { halfX: 1, halfZ: 1 },
  });
  receive(event);
  expect(game.sendScriptEvent).toHaveBeenCalledExactlyOnceWith(
    "yasu_ride:test_test_item_on_top",
    "dining_table table 0 0",
  );
});
