import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { PasteAt } from "../../../src/application/build/pasteAt";
import type { AimResult } from "../../../src/application/build/ports/aim";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { ShowPreview } from "../../../src/application/build/showPreview";
import type { Face } from "../../../src/domain/build/aim/face";
import { boxOf } from "../../../src/domain/build/box";
import { aimedPasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import type { QuarterTurn } from "../../../src/domain/build/rotation/quarterTurn";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { FakeAimReader, FakeFeedback, FakeSessions, nether } from "./fakes";

const playerId = asPlayerId("p");
const coordinate = fc.integer({ min: -100, max: 100 });
const aim = fc.record({
  ray: fc.constant({
    origin: { x: 0, y: 64, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
  }),
  block: fc.record({
    cell: fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    face: fc.constantFrom<Face>("up", "down", "north", "south", "east", "west"),
  }),
});
const turn = fc.constantFrom<QuarterTurn>(0, 1, 2, 3);

function setup(turn: QuarterTurn) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const clipboard = structureClipboard(
    boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }),
  );
  holdClipboard(session, clipboard);
  session.setFlow({ kind: "pasteAim", turn });
  return { repo, session, clipboard };
}

it("matches the domain target for every face and turn, and returns no target on air", () => {
  fc.assert(
    fc.property(aim, turn, (aim, turn) => {
      const { repo, clipboard } = setup(turn);
      const resolver = new ResolvePasteTarget(repo);
      expect(resolver.execute({ playerId, aim })).toEqual(
        aimedPasteTarget(clipboard, aim, turn),
      );
      expect(
        resolver.execute({ playerId, aim: { ray: aim.ray } }),
      ).toBeUndefined();
    }),
  );
});

it("returns no target without a session or clipboard", () => {
  fc.assert(
    fc.property(aim, (aim) => {
      const repo = new FakeSessions();
      const resolver = new ResolvePasteTarget(repo);
      expect(resolver.execute({ playerId, aim })).toBeUndefined();
      expect(repo.get(playerId)).toBeUndefined();
      repo.getOrCreate(playerId);
      expect(resolver.execute({ playerId, aim })).toBeUndefined();
    }),
  );
});

it("draws the same paste box that the press sends to PasteAt", () => {
  fc.assert(
    fc.property(
      aim,
      turn,
      fc.boolean(),
      fc.boolean(),
      (hit, turn, hasBlock, sneaking) => {
        const { repo, session } = setup(turn);
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          session.tickMode({ holding: true });
        const aim: AimResult = hasBlock ? hit : { ray: hit.ray };
        const reader = new FakeAimReader();
        reader.target = aim;
        const feedback = new FakeFeedback();
        const execute = vi.fn<PasteAt["execute"]>(() => "pasted");
        const press = new PressPasteAim(
          repo,
          { execute } as unknown as PasteAt,
          feedback,
        );
        new ShowPreview(repo, feedback, reader).execute(0);
        const result = press.execute({
          playerId,
          dimensionId: nether,
          aim,
          tick: 0,
          sneaking,
        });
        if (!hasBlock) {
          expect(result).toBe("menu");
          expect(execute).not.toHaveBeenCalled();
          expect(feedback.previews).toEqual([]);
          return;
        }
        expect(result).toBe("pasted");
        expect(execute).toHaveBeenCalledTimes(1);
        const target = execute.mock.calls[0]?.[0].target;
        expect(target).toBeDefined();
        expect(feedback.previews).toHaveLength(1);
        expect(feedback.previews[0]?.set).toEqual(
          previewPoints(session.flow, { blink: true, pasteBox: target?.box }),
        );
      },
    ),
  );
});
