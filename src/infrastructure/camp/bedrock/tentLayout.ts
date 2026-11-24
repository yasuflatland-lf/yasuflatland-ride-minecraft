import { type Dimension, type Entity, world } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { TENT_LAYOUT_VERSION, TENT_SPEC } from "../../../domain/camp/spec";
import {
  asTentId,
  type GroundReading,
  insideTent,
  inTentFootprint,
  PITCHED_STATE,
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
import { type Cell, cellKey, cellOf } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { chunkLoadedAt, safeBlockAt } from "../../shared/blocks";
import { dimensionById } from "../../shared/dimensions";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
import { AIR_BLOCK, isOwnTypeId, NAMESPACE } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import { isLightBlock } from "../../shared/lightBlocks";
import { ejectTo } from "../../shared/seating";
import { isTentBlockTypeId, TENT_ITEM, TENT_TYPE } from "../identifiers";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import { TENT_CELL_CODEC } from "./tentBlocks";
import { tentEntityOf } from "./tentEntity";
import type { TentFlapStore } from "./tentFlapStore";

const PLAYER_TYPE = "minecraft:player";
// Dropped items and xp orbs never stand in the way of a tent.
const NOT_OCCUPANTS = ["minecraft:item", "minecraft:xp_orb"];
export class TentLayout {
  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      registry: DynamicPropertyTentRegistry;
      blocks: CellLayer<TentId, TentBlock>;
      flaps: TentFlapStore;
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
    return isOwnTypeId(this.typeIdAt(dimensionId, at));
  }

  typeIdAt(dimensionId: DimensionId, at: Vec3): string | undefined {
    return safeBlockAt(dimensionById(dimensionId), at)?.typeId;
  }

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
      campSpace: clearCells.some((c) => this.isCampSpace(dimensionId, c)),
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

  /** The loaded tent in that dimension whose rooms hold `feet`. */
  tentContaining(dimensionId: DimensionId, feet: Vec3): TentId | undefined {
    return this.entriesIn(dimensionId).find(
      (e) => insideTent(e.pose, feet) && tentEntityOf(e.id) !== undefined,
    )?.id;
  }

  isOccupied(tentId: TentId): boolean {
    const entry = this.entryOf(tentId);
    if (!entry) return false;
    return (
      dimensionById(entry.dimensionId)
        ?.getPlayers()
        .some((p) => insideTent(entry.pose, p.location)) === true
    );
  }

  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void {
    const receiver = giveBackReceiver(TENT_SPEC.giveBack, playerId);
    const target = receiver ?? tentEntityOf(tentId);
    if (target) {
      giveBack(target, TENT_ITEM, receiver);
      return;
    }
    // Legacy folding can recover a registered tent after its entity is gone.
    const entry = this.entryOf(tentId);
    if (!entry) return;
    const dimension = dimensionById(entry.dimensionId);
    if (dimension)
      giveBack(
        { dimension, location: tentEntityLocation(entry.pose) },
        TENT_ITEM,
      );
  }

  entityLoaded(tentId: TentId): boolean {
    return tentEntityOf(tentId) !== undefined;
  }

  unlayBlocks(tentId: TentId): void {
    // Cells the layer holds in unloaded chunks are left to the loop's clearGone.
    this.deps.blocks.lay(tentId, tentEntityOf(tentId), []);
  }

  listTents(): readonly TentEntry[] {
    return this.deps.registry.all();
  }

  anchorLoaded(entry: TentEntry): boolean {
    const dimension = dimensionById(entry.dimensionId);
    return dimension !== undefined && chunkLoadedAt(dimension, entry.pose);
  }

  ejectPlayers(
    dimensionId: DimensionId,
    cells: readonly Cell[],
    exit: Cell,
  ): void {
    const dimension = dimensionById(dimensionId);
    if (!dimension) return;
    const cellKeys = new Set(cells.map(cellKey));
    for (const player of dimension.getPlayers()) {
      const feet = player.location;
      if (!cellKeys.has(cellKey(cellOf(feet)))) continue;
      // Move sleepers off the mattresses before their blocks disappear.
      ejectTo(player, exit, dimension);
    }
  }

  clearTentBlocks(dimensionId: DimensionId, cells: readonly Cell[]): void {
    for (const cell of cells) this.clearTentBlock(dimensionId, cell);
  }

  clearTentBlock(dimensionId: DimensionId, cell: Cell): void {
    const block = safeBlockAt(dimensionById(dimensionId), cell);
    if (isTentBlockTypeId(block?.typeId)) block?.setType(AIR_BLOCK);
  }

  removeTent(tentId: TentId): void {
    const tent = tentEntityOf(tentId);
    this.deps.registry.remove(tentId);
    this.deps.flaps.forget(tentId);
    tent?.remove();
  }

  clearBlocksByPose(tentId: TentId): void {
    const entry = this.entryOf(tentId);
    if (!entry) return;
    const dimension = dimensionById(entry.dimensionId);
    // Still-unloaded cells are cleared from the entity's saved cells when it
    // loads as an orphan.
    // Open or closed, lit or not, a flap or lantern cell holds the same block
    // id, so the pitched state finds it.
    for (const c of tentCells(entry.pose, PITCHED_STATE)) {
      try {
        const b = safeBlockAt(dimension, c);
        // A replacement block belongs to the player, not the tent.
        if (b?.typeId === TENT_CELL_CODEC.blockIdOf(c.block))
          b.setType(AIR_BLOCK);
      } catch {
        // The chunk unloaded; the orphan removal clears this cell later.
      }
    }
  }

  private entriesIn(dimensionId: DimensionId): TentEntry[] {
    return this.deps.registry
      .all()
      .filter((e) => e.dimensionId === dimensionId);
  }

  entryOf(tentId: TentId): TentEntry | undefined {
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
