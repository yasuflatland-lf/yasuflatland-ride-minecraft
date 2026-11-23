import { type CellBox, cellsOf } from "../../domain/build/box";
import type { EditKind } from "../../domain/build/edit/change";
import { completionMessage } from "../../domain/build/edit/completion";
import { airPressOffersUndo } from "../../domain/build/flow/press";
import type { SnapshotRecord } from "../../domain/build/history/history";
import type { BuildSession } from "../../domain/build/session";
import type { StructureHandle } from "../../domain/build/structure/handle";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { discardAll } from "./discardAll";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore, CaptureRefusal } from "./ports/structures";

interface PreflightCheck {
  readonly allows: (cell: Cell) => boolean;
  readonly busy: "beforeProtection" | "afterProtection" | "alreadyChecked";
}

interface RollbackOptions {
  readonly clearEntities?: false;
  readonly retainOnFailure?: true;
  readonly discardWithSnapshot?: StructureHandle;
}

export function isCaptureRefusal(
  result: StructureHandle | CaptureRefusal,
): result is CaptureRefusal {
  return result === "tooLarge" || result === "unreadable";
}

export class SnapshotEdit {
  constructor(
    private readonly session: BuildSession,
    private readonly structures: BuildStructureStore,
    private readonly feedback: BuildFeedback,
    private readonly context: { dimensionId: DimensionId; playerId: PlayerId },
  ) {}

  preflight(
    box: CellBox,
    check: PreflightCheck,
    refusal: () => void,
  ): "busy" | "blocked" | undefined {
    if (check.busy === "beforeProtection" && this.session.isEditing)
      return this.reportBusy();
    for (const cell of cellsOf(box)) {
      if (!check.allows(cell)) {
        refusal();
        return "blocked";
      }
    }
    if (check.busy === "afterProtection" && this.session.isEditing)
      return this.reportBusy();
    return undefined;
  }

  captureExact(
    box: CellBox,
    refusal: (reason: CaptureRefusal) => void,
  ): StructureHandle | undefined {
    const { dimensionId, playerId } = this.context;
    const handle = this.structures.capture(dimensionId, box, playerId, "exact");
    if (isCaptureRefusal(handle)) {
      refusal(handle);
      return undefined;
    }
    return handle;
  }

  clear(box: CellBox): boolean {
    const { dimensionId } = this.context;
    this.structures.clearEntities(dimensionId, box);
    return this.structures.clearBlocks(dimensionId, box);
  }

  commit(record: Omit<SnapshotRecord, "dimensionId">): void {
    discardAll(
      this.structures,
      this.session.recordSnapshot({
        dimensionId: this.context.dimensionId,
        ...record,
      }),
    );
  }

  rollback(
    box: CellBox,
    handle: StructureHandle,
    options: RollbackOptions = {},
  ): boolean {
    const { dimensionId } = this.context;
    if (options.clearEntities !== false)
      this.structures.clearEntities(dimensionId, box);
    const placed = this.structures.place(handle, dimensionId, box.min);
    if (placed || !options.retainOnFailure) {
      if (options.discardWithSnapshot !== undefined)
        this.structures.discard(options.discardWithSnapshot);
      this.structures.discard(handle);
    }
    return placed;
  }

  private reportBusy(): "busy" {
    this.feedback.showMessage(this.context.playerId, "busy");
    return "busy";
  }
}

export function reportEditCompletion(
  session: BuildSession,
  feedback: BuildFeedback,
  playerId: PlayerId,
  kind: EditKind,
  count: number,
  skipped: number,
): void {
  const { message, takesUndoHint } = completionMessage({
    kind,
    skipped,
    flowOffersUndo: airPressOffersUndo(session.flow) && session.hasHistory,
  });
  if (message === "undoDonePartial")
    feedback.showMessage(playerId, message, count, undefined, skipped);
  else feedback.showMessage(playerId, message, count);
  if (takesUndoHint && count > 0 && session.takeUndoHint())
    feedback.showUndoHint(playerId);
}
