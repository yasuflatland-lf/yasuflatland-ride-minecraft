import type {
  BuildStructureStore,
  CaptureRefusal,
} from "../../../../src/application/build/ports/structures";
import { AIR, type BlockState } from "../../../../src/domain/build/blockState";
import type { CellBox } from "../../../../src/domain/build/box";
import { cellsOf } from "../../../../src/domain/build/box";
import {
  type StructureHandle,
  structureHandle,
} from "../../../../src/domain/build/structure/handle";
import type { Cell } from "../../../../src/domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../../src/domain/shared/ids";
import type { FakeWorld } from "../fakes";

export type StructureCall =
  | {
      kind: "capture";
      dimensionId: DimensionId;
      box: CellBox;
      ownerId: PlayerId;
    }
  | {
      kind: "place";
      handle: StructureHandle;
      dimensionId: DimensionId;
      anchor: Cell;
    }
  | { kind: "clearEntities"; dimensionId: DimensionId; box: CellBox }
  | { kind: "clearBlocks"; dimensionId: DimensionId; box: CellBox }
  | { kind: "discard"; handle: StructureHandle };

/** An in-memory BuildStructureStore that records every call. */
export class FakeStructureStore implements BuildStructureStore {
  readonly calls: StructureCall[] = [];
  /** Handles that were captured and not discarded yet. */
  readonly live = new Set<StructureHandle>();
  /** When set, every capture returns this refusal. */
  captureRefusal: CaptureRefusal | undefined;
  captureRefusals: (CaptureRefusal | undefined)[] = [];
  placeSucceeds = true;
  clearBlocksSucceeds = true;
  private counter = 0;
  private readonly blocks = new Map<
    StructureHandle,
    { at: Cell; state: BlockState }[]
  >();
  constructor(private readonly world?: FakeWorld) {}

  captureFrom(
    source: FakeWorld,
    dimensionId: DimensionId,
    box: CellBox,
    ownerId: PlayerId,
  ) {
    const handle = this.capture(dimensionId, box, ownerId);
    if (handle !== "tooLarge" && handle !== "unreadable")
      this.save(handle, source, dimensionId, box);
    return handle;
  }

  private save(
    handle: StructureHandle,
    source: FakeWorld,
    dimensionId: DimensionId,
    box: CellBox,
  ) {
    this.blocks.set(
      handle,
      [...cellsOf(box)].map((cell) => ({
        at: {
          x: cell.x - box.min.x,
          y: cell.y - box.min.y,
          z: cell.z - box.min.z,
        },
        state: source.stateAt(dimensionId, cell) ?? AIR,
      })),
    );
  }

  capture(
    dimensionId: DimensionId,
    box: CellBox,
    ownerId: PlayerId,
  ): StructureHandle | CaptureRefusal {
    this.calls.push({ kind: "capture", dimensionId, box, ownerId });
    const refusal =
      this.captureRefusals.length > 0
        ? this.captureRefusals.shift()
        : this.captureRefusal;
    if (refusal !== undefined) return refusal;
    this.counter += 1;
    const handle = structureHandle(`fake_${ownerId}_${this.counter}`);
    this.live.add(handle);
    if (this.world) this.save(handle, this.world, dimensionId, box);
    return handle;
  }

  place(
    handle: StructureHandle,
    dimensionId: DimensionId,
    anchor: Cell,
  ): boolean {
    this.calls.push({ kind: "place", handle, dimensionId, anchor });
    if (!this.placeSucceeds || !this.live.has(handle)) return false;
    if (this.world)
      for (const { at, state } of this.blocks.get(handle) ?? []) {
        this.world.setState(
          dimensionId,
          { x: anchor.x + at.x, y: anchor.y + at.y, z: anchor.z + at.z },
          state,
        );
      }
    return true;
  }

  clearEntities(dimensionId: DimensionId, box: CellBox): void {
    this.calls.push({ kind: "clearEntities", dimensionId, box });
  }

  clearBlocks(dimensionId: DimensionId, box: CellBox): boolean {
    this.calls.push({ kind: "clearBlocks", dimensionId, box });
    if (this.clearBlocksSucceeds && this.world)
      for (const cell of cellsOf(box))
        this.world.setState(dimensionId, cell, AIR);
    return this.clearBlocksSucceeds;
  }

  discard(handle: StructureHandle): void {
    this.calls.push({ kind: "discard", handle });
    this.live.delete(handle);
    this.blocks.delete(handle);
  }
}
