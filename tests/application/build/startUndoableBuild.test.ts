import { expect, it, vi } from "vitest";
import { startUndoableBuild } from "../../../src/application/build/startUndoableBuild";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { cornerTaps } from "../../../src/domain/build/flow/flow";
import { selectionOf } from "../../../src/domain/build/selection";
import { BuildSession } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, overworld } from "./fakes";

it("refuses an edit above maxVolume before selecting the box or starting a job", () => {
  const playerId = asPlayerId("alex");
  const session = new BuildSession(playerId);
  const feedback = new FakeFeedback();
  const jobs = { start: vi.fn() };
  const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  const count = BUILD_SPEC.maxVolume + 1;
  expect(
    startUndoableBuild(
      { feedback, jobs },
      {
        playerId,
        session,
        count,
        plan: [],
        selectionBefore: box,
        selectionBeforeTaps: cornerTaps(box),
        after: selectionOf(overworld, box, blockStateOf("minecraft:stone")),
        taps: cornerTaps(box),
      },
    ),
  ).toBe(false);
  expect(feedback.messages).toMatchObject([{ message: "tooLarge", count }]);
  expect(jobs.start).not.toHaveBeenCalled();
  expect(session.confirmedBox).toBeUndefined();
  expect(session.isEditing).toBe(false);
});
