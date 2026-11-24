import { type Dimension, type Entity, world } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { TENT_LAYOUT_VERSION } from "../../../domain/camp/spec";
import {
  asTentId,
  type GroundReading,
  PITCHED_STATE,
  type PitchSurvey,
  type TentBlock,
  type TentId,
  type TentPose,
  tentCells,
  tentClearCells,
  tentEntityLocation,
  tentFootprintBox,
  tentGroundCells,
} from "../../../domain/camp/tent";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import { safeBlockAt } from "../../shared/blocks";
import { dimensionById } from "../../shared/dimensions";
import { AIR_BLOCK, NAMESPACE } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import { isLightBlock } from "../../shared/lightBlocks";
import { TENT_TYPE } from "../identifiers";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import type { TentSpace } from "./tentSpace";

const PLAYER_TYPE = "minecraft:player";
// Dropped items and xp orbs never stand in the way of a tent.
const NOT_OCCUPANTS = ["minecraft:item", "minecraft:xp_orb"];

export class TentPitching {
  constructor(
    private readonly deps: {
      space: TentSpace;
      isVehicleSpace: SpaceCheck;
      registry: DynamicPropertyTentRegistry;
      blocks: CellLayer<TentId, TentBlock>;
    },
  ) {}

  survey(dimensionId: DimensionId, pose: TentPose): PitchSurvey {
    const dimension = dimensionById(dimensionId);
    const clearCells = tentClearCells(pose);
    const clear = clearCells.map((c) => {
      const b = safeBlockAt(dimension, c);
      if (!b) return undefined;
      return isLightBlock(b) ? AIR_BLOCK : b.typeId;
    });
    const ground = tentGroundCells(pose).map((c): GroundReading | undefined => {
      const b = safeBlockAt(dimension, c);
      return b ? { typeId: b.typeId, liquid: b.isLiquid } : undefined;
    });
    // Every layer is asked: the clear rule reads a camper's light-block cells
    // as air, so a dock cell above the ground would slip past it.
    const vehicleSpace = clearCells.some((c) =>
      this.deps.isVehicleSpace(dimensionId, c),
    );
    return {
      clear,
      ground,
      vehicleSpace,
      campSpace: clearCells.some((c) =>
        this.deps.space.isCampSpace(dimensionId, c),
      ),
      occupants: this.occupants(dimension, pose),
      tents: this.deps.registry.all().length,
    };
  }

  clearDecorations(dimensionId: DimensionId, cells: readonly Cell[]): void {
    const dimension = dimensionById(dimensionId);
    for (const c of cells) {
      try {
        safeBlockAt(dimension, c)?.setType(AIR_BLOCK);
      } catch {
        // The cell unloaded since the survey; the lay skips a cell it cannot take.
      }
    }
  }

  pitch(dimensionId: DimensionId, pose: TentPose): TentId | undefined {
    let entity: Entity | undefined;
    let id: TentId | undefined;
    try {
      entity = world
        .getDimension(dimensionId)
        .spawnEntity(TENT_TYPE, tentEntityLocation(pose));
      entity.setRotation({ x: 0, y: pose.yaw });
      id = asTentId(entity.id);
      this.deps.registry.add({
        id,
        dimensionId,
        pose,
        layout: TENT_LAYOUT_VERSION,
      });
      this.deps.blocks.lay(id, entity, tentCells(pose, PITCHED_STATE));
      return id;
    } catch (e) {
      console.warn(
        `[${NAMESPACE}] tent pitch failed at ${dimensionId} ${JSON.stringify(pose)}: ${e}`,
      );
      this.undoPitch(id, entity);
      return undefined;
    }
  }

  // Each step is tried on its own, so one failure cannot strand the rest. The
  // registry entry goes first: a leftover entry would hold a tent slot and its
  // camp space for good, while a leftover entity is removed as an orphan.
  private undoPitch(id: TentId | undefined, entity: Entity | undefined): void {
    const undo = (step: string, run: () => void) => {
      try {
        run();
      } catch (e) {
        console.warn(`[${NAMESPACE}] tent pitch undo (${step}) failed: ${e}`);
      }
    };
    if (id !== undefined) {
      const tentId = id;
      undo("registry", () => this.deps.registry.remove(tentId));
      undo("cells", () => this.deps.blocks.lay(tentId, entity, []));
    }
    undo("entity", () => {
      if (entity?.isValid) entity.remove();
    });
  }

  private occupants(dimension: Dimension | undefined, pose: TentPose): number {
    if (!dimension) return 0;
    const box = tentFootprintBox(pose);
    try {
      return dimension
        .getEntities({
          location: box.min,
          volume: box.size,
          excludeTypes: NOT_OCCUPANTS,
        })
        .filter(
          (e) =>
            e.typeId === PLAYER_TYPE ||
            e.getComponent("minecraft:health") !== undefined,
        ).length;
    } catch {
      return 0;
    }
  }
}
