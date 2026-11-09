import { ScriptEventSource, system, world } from "@minecraft/server";
import { PlaceFurniture } from "../../../../application/resort/placeFurniture";
import type { TakeBackFurniture } from "../../../../application/resort/takeBackFurniture";
import type { SpaceCheck } from "../../../../application/shared/ports/space";
import type {
  FurnitureKind,
  FurniturePose,
} from "../../../../domain/resort/furniture";
import { asFurnitureId, type FurnitureId } from "../../../../domain/resort/ids";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
} from "../../../../domain/shared/ids";
import type { TopHostRegistry } from "../../../shared/tableTop/registry";
import {
  FURNITURE_IDS,
  TEST_FURNITURE_HIT,
  TEST_FURNITURE_PLACE,
} from "../../identifiers";
import { BedrockFurnitureWorld } from "../bedrockFurnitureWorld";

// Server-only hooks exercise production placement without a connected player (ADR 0010).
export function registerTestFurniture(
  adapter: BedrockFurnitureWorld,
  takeBack: TakeBackFurniture,
  deps: {
    topHosts: TopHostRegistry;
    isVehicleSpace: SpaceCheck;
    isCampSpace: SpaceCheck;
  },
): void {
  class TestWorld extends BedrockFurnitureWorld {
    override layTop(id: FurnitureId): void {
      adapter.layTop(id);
    }
    override spawn(
      dimensionId: DimensionId,
      pose: FurniturePose,
    ): FurnitureId | undefined {
      // Summon keeps entities spawned far from players alive in the test arena (ADR 0010).
      const dimension = world.getDimension(dimensionId);
      const at = pose.origin;
      // Decimal coordinates prevent summon from centering integer positions.
      const coords = [at.x, at.y, at.z].map((n) => n.toFixed(3)).join(" ");
      try {
        dimension.runCommand(
          `summon ${FURNITURE_IDS[pose.kind].entity} ${coords}`,
        );
      } catch {
        return undefined;
      }
      const entity = dimension.getEntities({
        type: FURNITURE_IDS[pose.kind].entity,
        location: at,
        maxDistance: 0.5,
      })[0];
      if (!entity) return undefined;
      entity.setRotation({ x: 0, y: pose.yaw });
      return asFurnitureId(entity.id);
    }
    override isCreative(): boolean {
      return true;
    }
  }
  const place = new PlaceFurniture(new TestWorld(deps));
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      if (ev.id === TEST_FURNITURE_PLACE) {
        const [kindName, ...coordinates] = ev.message.trim().split(/\s+/);
        const kind = (Object.keys(FURNITURE_IDS) as FurnitureKind[]).find(
          (key) => key === kindName,
        );
        const parts = coordinates.map(Number);
        const [x, y, z, yaw] = parts;
        if (
          kind === undefined ||
          parts.length !== 4 ||
          x === undefined ||
          y === undefined ||
          z === undefined ||
          yaw === undefined ||
          ![x, y, z].every(Number.isSafeInteger) ||
          !Number.isFinite(yaw)
        )
          return;
        place.execute({
          kind,
          player: asPlayerId("test-furniture"),
          dimension: asDimensionId("minecraft:overworld"),
          block: { x, y, z },
          face: "up",
          yaw,
          slot: 0,
        });
      } else if (ev.id === TEST_FURNITURE_HIT) {
        const id = asFurnitureId(ev.message.trim());
        if (adapter.entity(id))
          takeBack.hit({
            id,
            player: asPlayerId("test-furniture"),
            now: system.currentTick,
          });
      }
    },
    { namespaces: ["yasu_ride_test"] },
  );
}
