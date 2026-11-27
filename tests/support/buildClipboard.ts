import type { BlockState } from "../../src/domain/build/blockState";
import { AIR } from "../../src/domain/build/blockState";
import { boxOf, type CellBox, cellsOf } from "../../src/domain/build/box";
import {
  type Clipboard,
  clipboardOf,
} from "../../src/domain/build/clipboard/clipboard";
import { selectionOf } from "../../src/domain/build/selection";
import type { BuildSession } from "../../src/domain/build/session";
import { type Cell, cellOf } from "../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../src/domain/shared/ids";
import { FakeWorld } from "../application/build/fakes";
import { FakeStructureStore } from "../application/build/fakes/structureStore";

const COPY_DIMENSION = asDimensionId("minecraft:overworld");
const ORIGIN = cellOf({ x: 0, y: 0, z: 0 });

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
  session.completeCopy(
    selectionOf(COPY_DIMENSION, boxOf(ORIGIN, ORIGIN), AIR),
    clipboard,
  );
  session.clearSelection();
  if (confirmed) session.confirmBox(confirmed);
  session.setFlowForTest(flow);
}

export function structureClipboard(
  box: CellBox,
  read: (cell: Cell) => BlockState | undefined = () => AIR,
  store = new FakeStructureStore(),
): Clipboard {
  const source = new FakeWorld();
  for (const cell of cellsOf(box)) source.put(cell, read(cell) ?? AIR);
  const handle = store.captureFrom(
    source,
    COPY_DIMENSION,
    box,
    asPlayerId("clipboard"),
  );
  if (handle === "tooLarge" || handle === "unreadable") throw new Error(handle);
  return clipboardOf({
    selection: selectionOf(COPY_DIMENSION, box, read(box.min) ?? AIR),
    facing: "east",
    handle,
  });
}
