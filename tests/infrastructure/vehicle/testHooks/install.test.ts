import {
  type Entity,
  type Player,
  type ScriptEventCommandMessageAfterEvent,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import { BOOST_CONTROL } from "../../../../src/domain/vehicle/boost";
import { BLADE_SWITCH } from "../../../../src/domain/vehicle/kinds/bulldozer/equipment";
import { createVehicle } from "../../../../src/domain/vehicle/kinds/index";
import { ActionBarLog } from "../../../../src/infrastructure/vehicle/bedrock/actionBarLog";
import { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { installCamper } from "../../../../src/infrastructure/vehicle/kinds/camper/install";
import { InMemoryVehicleRepository } from "../../../../src/infrastructure/vehicle/persistence/inMemoryVehicleRepository";
import { installVehicleTestHooks } from "../../../../src/infrastructure/vehicle/testHooks/install";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";

vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server", Entity: "Entity" },
  world: { getAllPlayers: vi.fn() },
  system: {
    sendScriptEvent: vi.fn(),
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
  },
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
      actionBar: new ActionBarLog(index, () => 0),
    },
    () => undefined,
    () => undefined,
    () => {},
  );
  const subscribe = vi.mocked(system.afterEvents.scriptEventReceive.subscribe);
  subscribe.mockClear();
  installVehicleTestHooks({
    repo,
    index,
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
    id: "yasu_ride:test_boost",
    set: "dozer,on",
    reset: "dozer,off",
    read: ({ dozer }: ReturnType<typeof fixture>) =>
      dozer.capability(BOOST_CONTROL)?.isOn(),
    initial: false,
    expected: true,
    final: false,
  },
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

it("reports independent filled-map counts for spawn and give deliveries", () => {
  const { send } = fixture();
  const items: ({ typeId: string; amount: number } | undefined)[] = [
    { typeId: "minecraft:filled_map", amount: 4 },
    { typeId: "minecraft:map", amount: 2 },
    { typeId: "minecraft:filled_map", amount: 3 },
  ];
  const player = {
    id: "player",
    getComponent: () => ({
      container: {
        size: items.length,
        emptySlotsCount: items.filter((item) => item === undefined).length,
        getItem: (slot: number) => items[slot],
      },
    }),
    runCommand: vi.fn(),
  };
  vi.mocked(world.getAllPlayers).mockReturnValue([player as unknown as Player]);
  const event = "yasu_ride:test_nav_map";
  const result = "yasu_ride:test_nav_map_result";
  send(event, "player,village", ScriptEventSource.Entity);
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
  send(event, "player,invalid");
  send(event, "missing,village");
  expect(system.sendScriptEvent).toHaveBeenCalledWith(
    result,
    expect.stringMatching(/^player,error:/),
  );
  expect(system.sendScriptEvent).toHaveBeenCalledWith(
    result,
    expect.stringMatching(/^missing,error:/),
  );
  expect(player.runCommand).not.toHaveBeenCalled();
  send(event, "player,village");
  expect(player.runCommand).toHaveBeenCalledOnce();
  expect(system.sendScriptEvent).toHaveBeenCalledWith(
    result,
    "player,unknown,spawn,-,-,7,7",
  );
  items[1] = undefined;
  player.runCommand.mockImplementationOnce(() => {
    items[1] = { typeId: "minecraft:filled_map", amount: 1 };
  });
  send(event, "player,village");
  expect(system.sendScriptEvent).toHaveBeenCalledWith(
    result,
    "player,given,give,7,8,7,8",
  );
});
