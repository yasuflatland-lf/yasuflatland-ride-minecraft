import {
  type Entity,
  EntityInitializationCause,
  type EntityLoadAfterEvent,
  type EntitySpawnAfterEvent,
  world,
} from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { NormalizePaint } from "../../../../../src/application/vehicle/normalizePaint";
import { registerNormalizePaint } from "../../../../../src/infrastructure/vehicle/kinds/camper/handlers/normalizePaint";
import { FakeWorld } from "../../../../application/vehicle/fakes";
import { defined } from "../../../../support/defined";

vi.mock("@minecraft/server", () => ({
  EntityInitializationCause: {
    Loaded: "Loaded",
    Spawned: "Spawned",
    Born: "Born",
  },
  world: {
    afterEvents: {
      entityLoad: { subscribe: vi.fn() },
      entitySpawn: { subscribe: vi.fn() },
    },
  },
}));

beforeEach(() => vi.clearAllMocks());

it.each([
  { event: "load", typeId: "yasu_ride:camper", isValid: true, changes: true },
  { event: "Loaded", typeId: "yasu_ride:camper", isValid: true, changes: true },
  { event: "load", typeId: "yasu_ride:suv", isValid: true, changes: false },
  { event: "Loaded", typeId: "yasu_ride:suv", isValid: true, changes: false },
  { event: "load", typeId: "yasu_ride:camper", isValid: false, changes: false },
  {
    event: "Loaded",
    typeId: "yasu_ride:camper",
    isValid: false,
    changes: false,
  },
  {
    event: "Spawned",
    typeId: "yasu_ride:camper",
    isValid: true,
    changes: false,
  },
  { event: "Born", typeId: "yasu_ride:camper", isValid: true, changes: false },
] as const)(
  "$event for $typeId with isValid=$isValid normalizes=$changes",
  ({ event, typeId, isValid, changes }) => {
    const paintWorld = new FakeWorld();
    paintWorld.kinds.set("camper", "camper");
    paintWorld.paints.set("camper", "red");
    registerNormalizePaint(new NormalizePaint(paintWorld));
    const entity = { id: "camper", typeId, isValid } as Entity;
    if (event === "load") {
      const onLoad = defined(
        vi.mocked(world.afterEvents.entityLoad.subscribe).mock.calls[0]?.[0],
        "entityLoad handler",
      );
      onLoad({ entity } as EntityLoadAfterEvent);
    } else {
      const onSpawn = defined(
        vi.mocked(world.afterEvents.entitySpawn.subscribe).mock.calls[0]?.[0],
        "entitySpawn handler",
      );
      onSpawn({
        entity,
        cause: EntityInitializationCause[event],
      } as EntitySpawnAfterEvent);
    }
    expect(paintWorld.paints.get("camper")).toBe(changes ? "khaki" : "red");
    expect(paintWorld.calls).toEqual(changes ? ["paint:camper:khaki"] : []);
    expect(paintWorld.sounds).toEqual([]);
  },
);
