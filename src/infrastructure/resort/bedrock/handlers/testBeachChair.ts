import { ScriptEventSource, system, world } from "@minecraft/server";
import { PlaceBeachChair } from "../../../../application/resort/placeBeachChair";
import type { TakeBackBeachChair } from "../../../../application/resort/takeBackBeachChair";
import type { SpaceCheck } from "../../../../application/shared/ports/space";
import {
  type BeachChairPose,
  beachChairOrigin,
} from "../../../../domain/resort/beachChair";
import {
  asBeachChairId,
  type BeachChairId,
} from "../../../../domain/resort/ids";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
} from "../../../../domain/shared/ids";
import { NAMESPACE } from "../../../shared/identifiers";
import {
  BEACH_CHAIR,
  TEST_BEACH_CHAIR_HIT,
  TEST_BEACH_CHAIR_PLACE,
} from "../../identifiers";
import { BedrockBeachChairWorld } from "../bedrockBeachChairWorld";

// Server-only hooks exercise production placement without a connected player (ADR 0010).
export function registerTestBeachChair(
  adapter: BedrockBeachChairWorld,
  takeBack: TakeBackBeachChair,
  deps: { isVehicleSpace: SpaceCheck; isCampSpace: SpaceCheck },
): void {
  class TestWorld extends BedrockBeachChairWorld {
    override spawn(
      dimensionId: DimensionId,
      pose: BeachChairPose,
    ): BeachChairId | undefined {
      // Summon keeps entities spawned far from players alive in the test arena (ADR 0010).
      const dimension = world.getDimension(dimensionId);
      const at = beachChairOrigin(pose);
      dimension.runCommand(`summon ${BEACH_CHAIR} ${at.x} ${at.y} ${at.z}`);
      const entity = dimension.getEntities({
        type: BEACH_CHAIR,
        location: at,
        maxDistance: 0.5,
      })[0];
      if (!entity) return undefined;
      entity.setRotation({ x: 0, y: pose.yaw });
      return asBeachChairId(entity.id);
    }
    override isCreative(): boolean {
      return true;
    }
  }
  const place = new PlaceBeachChair(new TestWorld(deps));
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      if (ev.id === TEST_BEACH_CHAIR_PLACE) {
        const parts = ev.message.trim().split(/\s+/).map(Number);
        const [x, y, z, yaw] = parts;
        if (
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
          player: asPlayerId("test-beach-chair"),
          dimension: asDimensionId("minecraft:overworld"),
          block: { x, y, z },
          face: "up",
          yaw,
          slot: 0,
        });
      } else if (ev.id === TEST_BEACH_CHAIR_HIT) {
        const id = asBeachChairId(ev.message.trim());
        if (adapter.entity(id))
          takeBack.execute({
            id,
            player: asPlayerId("test-beach-chair"),
            tick: system.currentTick,
          });
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
