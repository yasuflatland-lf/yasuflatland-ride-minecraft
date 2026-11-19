import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { RotatePasteAim } from "../../../src/application/build/rotatePasteAim";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { nextQuarterTurn } from "../../../src/domain/build/rotation/quarterTurn";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import { confirmEndpointHeight } from "../../support/buildSelection";
import { FakeFeedback, FakeSessions, nether } from "./fakes";

const playerId = asPlayerId("p");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });

it("hints and preserves every inactive flow, including a missing session or clipboard", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (at, hasClipboard) => {
      const repo = new FakeSessions();
      const feedback = new FakeFeedback();
      const rotate = new RotatePasteAim(repo, feedback);
      expect(rotate.execute({ playerId })).toBe("ignored");
      expect(repo.get(playerId)).toBeUndefined();
      const session = repo.getOrCreate(playerId);
      const create = vi.spyOn(repo, "getOrCreate");
      const box = boxOf(at, at);
      if (hasClipboard)
        session.completeCopy(
          selectionOf(nether, box, AIR),
          structureClipboard(box),
        );
      const clipboard = session.clipboard;
      const first = tapBlock(
        { kind: "idle" },
        nether,
        at,
        blockStateOf("minecraft:stone"),
      );
      const endpoint = confirmEndpointHeight(
        tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 }),
      );
      const flows = [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "rotate"),
        ...(!hasClipboard ? [beginPasteAim()] : []),
      ];
      for (const flow of flows) {
        session.setFlow(flow);
        expect(rotate.execute({ playerId })).toBe("ignored");
        expect(session.flow).toBe(flow);
        expect(session.clipboard).toBe(clipboard);
        expect(session.hasHistory).toBe(false);
        expect(session.isEditing).toBe(false);
      }
      expect(create).not.toHaveBeenCalled();
      expect(feedback.messages).toEqual(
        Array.from({ length: flows.length + 1 }, () => ({
          message: "pasteInactive",
        })),
      );
    }),
  );
});

it("advances the effective turn for any copy and gaze facing without editing", () => {
  fc.assert(
    fc.property(
      cell,
      fc.constantFrom(...FACINGS),
      fc.constantFrom(...FACINGS),
      fc.integer({ min: 0, max: 3 }),
      (at, copied, gaze, turns) => {
        const repo = new FakeSessions();
        const feedback = new FakeFeedback();
        const session = repo.getOrCreate(playerId);
        const box = boxOf(at, at);
        const clipboard = { ...structureClipboard(box), facing: copied };
        session.completeCopy(selectionOf(nether, box, AIR), clipboard);
        session.followPasteFacing(gaze);
        for (let i = 0; i < turns; i++) session.rotatePaste();
        const before = session.pasteTurn;
        expect(new RotatePasteAim(repo, feedback).execute({ playerId })).toBe(
          "rotated",
        );
        expect(session.pasteTurn).toBe(nextQuarterTurn(before));
        expect(session.clipboard).toBe(clipboard);
        expect(session.confirmedBox).toEqual({
          material: AIR,
          dimensionId: nether,
          box,
        });
        expect(session.hasHistory).toBe(false);
        expect(session.isEditing).toBe(false);
        expect(feedback.messages).toEqual([]);
      },
    ),
  );
});
