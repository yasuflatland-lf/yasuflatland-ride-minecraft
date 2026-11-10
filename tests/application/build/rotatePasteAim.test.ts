import fc from "fast-check";
import { expect, it } from "vitest";
import { RotatePasteAim } from "../../../src/application/build/rotatePasteAim";
import { boxOf } from "../../../src/domain/build/box";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import { FakeSessions, overworld } from "./fakes";

const playerId = asPlayerId("rotate");

it("rotates exactly when a clipboard is held in paste aiming", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.integer({ min: 0, max: 3 }),
      (clipboard, aiming, steps) => {
        const repo = new FakeSessions();
        const session = repo.getOrCreate(playerId);
        const at = { x: 0, y: 0, z: 0 };
        if (clipboard)
          session.completeCopy(
            overworld,
            boxOf(at, at),
            structureClipboard(boxOf(at, at)),
          );
        session.setFlow(aiming ? beginPasteAim() : { kind: "idle" });
        for (let i = 0; i < steps; i++) session.rotatePaste();
        const flow = session.flow;
        const turn = session.pasteTurn;
        expect(new RotatePasteAim(repo).execute({ playerId })).toBe(
          clipboard && aiming ? "rotated" : "ignored",
        );
        if (clipboard && aiming) expect(session.pasteTurn).toBe((turn + 1) % 4);
        else expect(session.flow).toBe(flow);
      },
    ),
  );
});

it("ignores a missing session without creating one", () => {
  const repo = new FakeSessions();
  expect(new RotatePasteAim(repo).execute({ playerId })).toBe("ignored");
  expect(repo.get(playerId)).toBeUndefined();
});
