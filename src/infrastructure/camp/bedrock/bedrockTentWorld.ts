// Implements TentWorld with @minecraft/server (ADR 0012, 0131).
import {
  type Dimension,
  type Entity,
  ItemStack,
  type Player,
  world,
} from "@minecraft/server";
import type { TentWorld } from "../../../application/camp/ports/tent";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { TENT_SPEC } from "../../../domain/camp/spec";
import {
  asTentId,
  type GroundReading,
  insideTent,
  inTentFootprint,
  type PitchRefusal,
  type PitchSurvey,
  type TentBlock,
  type TentId,
  type TentPose,
  tentBlockAt,
  tentCells,
  tentClearCells,
  tentEntityLocation,
  tentFootprintBox,
  tentGroundCells,
} from "../../../domain/camp/tent";
import type { TentEntry } from "../../../domain/camp/tentRegistry";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { AIR_BLOCK, NAMESPACE } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import { isLightBlock } from "../../shared/lightBlocks";
import { consumeHeld, giveOrDrop, isCreative } from "../../shared/players";
import {
  PITCH_REFUSAL_MESSAGE,
  TENT_HITS_LEFT_HINT,
  TENT_ITEM,
  TENT_OCCUPIED_HINT,
  TENT_TYPE,
} from "../identifiers";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import { TENT_CELL_CODEC } from "./tentBlocks";

const PLAYER_TYPE = "minecraft:player";
// Dropped items and xp orbs never stand in the way of a tent.
const NOT_OCCUPANTS = ["minecraft:item", "minecraft:xp_orb"];

function playerOf(playerId: PlayerId): Player | undefined {
  const entity = world.getEntity(playerId);
  return entity?.typeId === PLAYER_TYPE ? (entity as Player) : undefined;
}

function tentOf(tentId: TentId): Entity | undefined {
  const entity = world.getEntity(tentId);
  return entity?.isValid && entity.typeId === TENT_TYPE ? entity : undefined;
}

function dimensionOf(dimensionId: DimensionId): Dimension | undefined {
  try {
    return world.getDimension(dimensionId);
  } catch {
    return undefined; // Unknown dimension id
  }
}

function blockAt(dimension: Dimension | undefined, at: Vec3) {
  try {
    return dimension?.getBlock(at);
  } catch {
    return undefined; // Unloaded chunk, or a cell outside the world
  }
}

export class BedrockTentWorld implements TentWorld {
  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      registry: DynamicPropertyTentRegistry;
      blocks: CellLayer<TentId, TentBlock>;
    },
  ) {}

  /** Whether a pitched tent in that dimension takes `cell`; answers from the saved registry, before any tent is loaded. */
  isCampSpace(dimensionId: DimensionId, cell: Cell): boolean {
    return this.entriesIn(dimensionId).some((e) =>
      inTentFootprint(e.pose, cell),
    );
  }

  /** The tent whose block `typeId` is at `cell`; before the first lay after /reload, from the registry. */
  tentBlockOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): TentId | undefined {
    const laid = this.deps.blocks.laidBlockOwner(dimensionId, cell, typeId);
    if (laid !== undefined) return laid;
    return this.entriesIn(dimensionId).find((e) => {
      const block = tentBlockAt(e.pose, cell);
      return block !== undefined && TENT_CELL_CODEC.blockIdOf(block) === typeId;
    })?.id;
  }

  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean {
    return this.typeIdAt(dimensionId, at)?.startsWith(`${NAMESPACE}:`) === true;
  }

  typeIdAt(dimensionId: DimensionId, at: Vec3): string | undefined {
    return blockAt(dimensionOf(dimensionId), at)?.typeId;
  }

  survey(dimensionId: DimensionId, pose: TentPose): PitchSurvey {
    const dimension = dimensionOf(dimensionId);
    const clearCells = tentClearCells(pose);
    const clear = clearCells.map((c) => {
      const b = blockAt(dimension, c);
      if (!b) return undefined;
      return isLightBlock(b) ? AIR_BLOCK : b.typeId;
    });
    const ground = tentGroundCells(pose).map((c): GroundReading | undefined => {
      const b = blockAt(dimension, c);
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
      campSpace: clearCells.some((c) => this.isCampSpace(dimensionId, c)),
      occupants: this.occupants(dimension, pose),
      tents: this.deps.registry.all().length,
    };
  }

  isCreative(playerId: PlayerId): boolean {
    return isCreative(playerOf(playerId));
  }

  consumeTentItem(playerId: PlayerId, slot: number): boolean {
    const player = playerOf(playerId);
    return player !== undefined && consumeHeld(player, TENT_ITEM, slot);
  }

  giveTentItem(playerId: PlayerId): void {
    const player = playerOf(playerId);
    if (player) giveOrDrop(player, [new ItemStack(TENT_ITEM, 1)]);
  }

  clearDecorations(dimensionId: DimensionId, cells: readonly Cell[]): void {
    const dimension = dimensionOf(dimensionId);
    for (const c of cells) {
      try {
        blockAt(dimension, c)?.setType(AIR_BLOCK);
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
      this.deps.registry.add({ id, dimensionId, pose });
      this.deps.blocks.lay(id, entity, tentCells(pose));
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

  showPitchRefusal(playerId: PlayerId, reason: PitchRefusal): void {
    const translate = PITCH_REFUSAL_MESSAGE[reason];
    playerOf(playerId)?.onScreenDisplay.setActionBar(
      reason === "limit"
        ? { translate, with: [String(TENT_SPEC.maxTents)] }
        : { translate },
    );
  }

  isOccupied(tentId: TentId): boolean {
    const entry = this.entryOf(tentId);
    if (!entry) return false;
    return (
      dimensionOf(entry.dimensionId)
        ?.getPlayers()
        .some((p) => insideTent(entry.pose, p.location)) === true
    );
  }

  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void {
    const player = playerId === undefined ? undefined : playerOf(playerId);
    const item = new ItemStack(TENT_ITEM, 1);
    if (player) {
      giveOrDrop(player, [item]);
      return;
    }
    const tent = tentOf(tentId);
    if (tent) {
      tent.dimension.spawnItem(item, tent.location);
      return;
    }
    const entry = this.entryOf(tentId);
    if (entry)
      dimensionOf(entry.dimensionId)?.spawnItem(
        item,
        tentEntityLocation(entry.pose),
      );
  }

  takeDown(tentId: TentId): void {
    const tent = tentOf(tentId);
    const entry = this.entryOf(tentId);
    // Cells the layer holds in unloaded chunks are left to the loop's clearGone.
    this.deps.blocks.lay(tentId, tent, []);
    // Hits count from the registry before the entity loads after /reload or a
    // restart, and the layer then holds nothing for the tent: clear its loaded
    // cells by pose. Cells in chunks still unloaded are cleared from the
    // entity's saved cells when it loads as an orphan.
    if (!tent && entry) this.clearByPose(entry);
    this.deps.registry.remove(tentId);
    tent?.remove();
  }

  private clearByPose(entry: TentEntry): void {
    const dimension = dimensionOf(entry.dimensionId);
    for (const c of tentCells(entry.pose)) {
      try {
        const b = blockAt(dimension, c);
        // A replacement block belongs to the player, not the tent.
        if (b?.typeId === TENT_CELL_CODEC.blockIdOf(c.block))
          b.setType(AIR_BLOCK);
      } catch {
        // The chunk unloaded; the orphan removal clears this cell later.
      }
    }
  }

  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    playerOf(playerId)?.onScreenDisplay.setActionBar({
      translate: TENT_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }

  showOccupied(playerId: PlayerId): void {
    playerOf(playerId)?.onScreenDisplay.setActionBar({
      translate: TENT_OCCUPIED_HINT,
    });
  }

  private entriesIn(dimensionId: DimensionId): TentEntry[] {
    return this.deps.registry
      .all()
      .filter((e) => e.dimensionId === dimensionId);
  }

  private entryOf(tentId: TentId): TentEntry | undefined {
    return this.deps.registry.all().find((e) => e.id === tentId);
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
