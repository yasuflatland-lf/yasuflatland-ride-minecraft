import { boxOf } from "../../src/domain/build/box";
import type { Clipboard } from "../../src/domain/build/clipboard/clipboard";
import type { BuildSession } from "../../src/domain/build/session";
import { asDimensionId } from "../../src/domain/shared/ids";

const COPY_DIMENSION = asDimensionId("minecraft:overworld");
const ORIGIN = { x: 0, y: 0, z: 0 };

/**
 * Gives the session a clipboard the way a copy does (`completeCopy`), then puts
 * the selection and flow back as they were so a test can pick them separately.
 */
export function holdClipboard(
  session: BuildSession,
  clipboard: Clipboard,
): void {
  const confirmed = session.confirmedBox;
  const flow = session.flow;
  session.completeCopy(COPY_DIMENSION, boxOf(ORIGIN, ORIGIN), clipboard);
  session.clearSelection();
  if (confirmed) session.confirmBox(confirmed.dimensionId, confirmed.box);
  session.setFlow(flow);
}
