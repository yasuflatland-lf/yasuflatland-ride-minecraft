import type {
  BuildStructureStore,
  CaptureRefusal,
} from "../../../../src/application/build/ports/structures";
import type { CellBox } from "../../../../src/domain/build/box";
import {
  type StructureHandle,
  structureHandle,
} from "../../../../src/domain/build/structure/handle";
import type { Cell } from "../../../../src/domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../../src/domain/shared/ids";

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
    return handle;
  }

  place(
    handle: StructureHandle,
    dimensionId: DimensionId,
    anchor: Cell,
  ): boolean {
    this.calls.push({ kind: "place", handle, dimensionId, anchor });
    return this.placeSucceeds && this.live.has(handle);
  }

  clearEntities(dimensionId: DimensionId, box: CellBox): void {
    this.calls.push({ kind: "clearEntities", dimensionId, box });
  }

  clearBlocks(dimensionId: DimensionId, box: CellBox): boolean {
    this.calls.push({ kind: "clearBlocks", dimensionId, box });
    return this.clearBlocksSucceeds;
  }

  discard(handle: StructureHandle): void {
    this.calls.push({ kind: "discard", handle });
    this.live.delete(handle);
  }
}
