import type { CellBox } from "../../domain/build/box";
import type { PlanStep } from "../../domain/build/edit/change";
import type { Taps } from "../../domain/build/flow/taps";
import type { Selection } from "../../domain/build/selection";
import type { BuildSession } from "../../domain/build/session";
import type { PlayerId } from "../../domain/shared/ids";
import { beginCheckedEdit } from "./beginCheckedEdit";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

/**
 * Checks the volume and busy state, selects after with the supplied taps, and
 * starts a job that restores selectionBefore on Undo. A refusal is reported to the player.
 */
export function startUndoableBuild(
  deps: {
    readonly feedback: BuildFeedback;
    readonly jobs: Pick<EditJobs, "start">;
  },
  cmd: {
    readonly playerId: PlayerId;
    readonly session: BuildSession;
    readonly count: number;
    readonly plan: Iterable<PlanStep>;
    readonly selectionBefore: CellBox;
    readonly selectionBeforeTaps: Taps;
    readonly keepEmpty?: true;
    readonly after: Selection;
    readonly taps: Taps;
  },
): boolean {
  const { playerId, session, count } = cmd;
  if (!beginCheckedEdit(session, deps.feedback, playerId, count)) return false;
  const { plan, selectionBefore, selectionBeforeTaps, after, taps } = cmd;
  session.confirmBox(after, "selected", taps);
  deps.jobs.start(playerId, after.dimensionId, plan, "undoable", {
    selectionBefore,
    selectionBeforeTaps,
    ...(cmd.keepEmpty && { keepEmpty: true }),
    selectionAfter: after.box,
  });
  return true;
}
