import {
  type Entity,
  type ScriptEventCommandMessageAfterEvent,
  ScriptEventSource,
  system,
} from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import { BLADE_SWITCH } from "../../../../src/domain/vehicle/kinds/bulldozer/equipment";
import { createVehicle } from "../../../../src/domain/vehicle/kinds/index";
import { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { installCamper } from "../../../../src/infrastructure/vehicle/kinds/camper/install";
import { InMemoryVehicleRepository } from "../../../../src/infrastructure/vehicle/persistence/inMemoryVehicleRepository";
import { installVehicleTestHooks } from "../../../../src/infrastructure/vehicle/testHooks/install";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";

vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server", Entity: "Entity" },
  system: { afterEvents: { scriptEventReceive: { subscribe: vi.fn() } } },
}));

function fixture() {
  const repo = new InMemoryVehicleRepository();
  const dozer = createVehicle("bulldozer", asVehicleId("dozer"), 0);
  const camper = createVehicle("camper", asVehicleId("camper"), 0);
  repo.save(dozer);
  repo.save(camper);
  const testHeldItems = new VehicleTestStore<string>();
  const index = new EntityIndex();
  const setDynamicProperty = vi.fn();
  index.track({
    id: camper.id,
    isValid: true,
    setDynamicProperty,
  } as unknown as Entity);
  const camperParts = installCamper(
    {
      repo,
      index,
      inventory: new BedrockInventory(index),
      clock: { now: () => 0 },
    },
    () => undefined,
    () => undefined,
    () => {},
  );
  const subscribe = vi.mocked(system.afterEvents.scriptEventReceive.subscribe);
  subscribe.mockClear();
  installVehicleTestHooks({
    repo,
    registerKindTestHooks: camperParts.registerTestHooks,
    testHeldItems,
  });

  function send(
    id: string,
    message: string,
    sourceType = ScriptEventSource.Server,
  ) {
    for (const [receive, filter] of subscribe.mock.calls) {
      expect(filter).toEqual({ namespaces: ["yasu_ride"] });
      receive({
        id,
        message,
        sourceType,
      } as ScriptEventCommandMessageAfterEvent);
    }
  }
  return { dozer, camper, testHeldItems, setDynamicProperty, send };
}

it.each([
  {
    id: "yasu_ride:test_tool",
    set: "dozer,blade_switch,down",
    reset: "dozer,blade_switch,up",
    read: ({ dozer }: ReturnType<typeof fixture>) =>
      dozer.equipmentState(BLADE_SWITCH),
    initial: "up",
    expected: "down",
    final: "up",
  },
  {
    id: "yasu_ride:test_decor",
    set: "camper,table,potted_plant",
    reset: "camper,table,clear",
    read: ({ setDynamicProperty }: ReturnType<typeof fixture>) =>
      setDynamicProperty.mock.lastCall,
    initial: undefined,
    expected: [
      "yasu_ride:decor",
      JSON.stringify([{ slot: "table", item: "potted_plant" }]),
    ],
    final: ["yasu_ride:decor", undefined],
  },
  {
    id: "yasu_ride:test_held_item",
    set: "dozer,yasu_ride:blade_switch",
    reset: "dozer,clear",
    read: ({ dozer, testHeldItems }: ReturnType<typeof fixture>) =>
      testHeldItems.get(dozer.id),
    initial: undefined,
    expected: "yasu_ride:blade_switch",
    final: undefined,
  },
])(
  "dispatches $id only from valid server events",
  ({ id, set, reset, read, initial, expected, final }) => {
    const parts = fixture();
    parts.send(id, set, ScriptEventSource.Entity);
    parts.send("yasu_ride:other", set);
    expect(read(parts)).toEqual(initial);
    parts.send(id, set);
    expect(read(parts)).toEqual(expected);
    using warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parts.send(id, "invalid");
    expect(warn).toHaveBeenCalledOnce();
    expect(read(parts)).toEqual(expected);
    parts.send(id, reset);
    expect(read(parts)).toEqual(final);
  },
);

it("ignores tool commands for a missing vehicle or a vehicle without that tool", () => {
  const { camper, dozer, send } = fixture();
  send("yasu_ride:test_tool", "missing,blade_switch,down");
  send("yasu_ride:test_tool", "camper,blade_switch,down");
  expect(camper.equipmentState(BLADE_SWITCH)).toBeUndefined();
  expect(dozer.equipmentState(BLADE_SWITCH)).toBe("up");
});
