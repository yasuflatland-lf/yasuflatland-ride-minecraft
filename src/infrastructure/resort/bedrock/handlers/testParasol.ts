import { ScriptEventSource, system, world } from "@minecraft/server";
import { PlaceParasol } from "../../../../application/resort/placeParasol";
import type { TakeBackParasol } from "../../../../application/resort/takeBackParasol";
import type { SpaceCheck } from "../../../../application/shared/ports/space";
import { asParasolId, type ParasolId } from "../../../../domain/resort/ids";
import type { ParasolPose } from "../../../../domain/resort/parasolPose";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
} from "../../../../domain/shared/ids";
import { NAMESPACE } from "../../../shared/identifiers";
import {
  BEACH_PARASOL,
  TEST_PARASOL_HIT,
  TEST_PARASOL_PLACE,
} from "../../identifiers";
import { BedrockParasolWorld } from "../bedrockParasolWorld";

// Server-only hooks exercise production placement without a connected player (ADR 0010).
export function registerTestParasol(
  adapter: BedrockParasolWorld,
  takeBack: TakeBackParasol,
  deps: { isVehicleSpace: SpaceCheck; isCampSpace: SpaceCheck },
): void {
  class TestWorld extends BedrockParasolWorld {
    override spawn(
      dimensionId: DimensionId,
      pose: ParasolPose,
    ): ParasolId | undefined {
      // Summon keeps entities spawned far from players alive in the test arena (ADR 0010).
      const dimension = world.getDimension(dimensionId);
      const at = { x: pose.base.x + 0.5, y: pose.base.y, z: pose.base.z + 0.5 };
      dimension.runCommand(`summon ${BEACH_PARASOL} ${at.x} ${at.y} ${at.z}`);
      const entity = dimension.getEntities({
        type: BEACH_PARASOL,
        location: at,
        maxDistance: 0.5,
      })[0];
      if (!entity) return undefined;
      entity.setRotation({ x: 0, y: pose.yaw });
      return asParasolId(entity.id);
    }
    override isCreative(): boolean {
      return true;
    }
    override layCeiling(
      id: Parameters<BedrockParasolWorld["layCeiling"]>[0],
    ): void {
      adapter.layCeiling(id);
    }
  }
  const place = new PlaceParasol(new TestWorld(deps));
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      if (ev.id === TEST_PARASOL_PLACE) {
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
          player: asPlayerId("test-parasol"),
          dimension: asDimensionId("minecraft:overworld"),
          block: { x, y, z },
          face: "up",
          yaw,
          slot: 0,
        });
      } else if (ev.id === TEST_PARASOL_HIT) {
        const id = asParasolId(ev.message.trim());
        if (adapter.entity(id))
          takeBack.execute({
            id,
            player: asPlayerId("test-parasol"),
            tick: system.currentTick,
          });
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
