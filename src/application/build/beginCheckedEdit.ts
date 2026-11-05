import type { BuildSession } from "../../domain/build/session";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export function beginCheckedEdit(
  session: BuildSession,
  feedback: BuildFeedback,
  playerId: PlayerId,
  count: number,
): boolean {
  if (count > BUILD_SPEC.maxVolume) {
    feedback.showMessage(playerId, "tooLarge", count);
    return false;
  }
  const refusal = session.beginEdit();
  if (refusal) {
    feedback.showMessage(playerId, refusal);
    return false;
  }
  return true;
}
