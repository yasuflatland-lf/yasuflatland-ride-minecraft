import fc from "fast-check";
import { expect, it } from "vitest";
import { DescribeBuild } from "../../../src/application/build/describeBuild";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  type BuildFlow,
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { FakeSessions, overworld } from "./fakes";

const playerId = asPlayerId("builder");
const stone = blockStateOf("minecraft:stone");

it("reports every flow, clipboard presence and domain paste entries without changing the session", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -100, max: 100 }),
        y: fc.integer({ min: 0, max: 100 }),
        z: fc.integer({ min: -100, max: 100 }),
      }),
      fc.boolean(),
      fc.boolean(),
      (cell, clipboard, history) => {
        const repo = new FakeSessions();
        const session = repo.getOrCreate(playerId);
        const describe = new DescribeBuild(repo);
        if (clipboard)
          holdClipboard(
            session,
            structureClipboard(boxOf(cell, cell), () => stone),
          );
        if (history)
          session.finishEdit(
            {
              dimensionId: overworld,
              changes: [{ cell, before: stone, after: stone }],
            },
            "undoable",
          );
        const idle: BuildFlow = { kind: "idle" };
        const first = tapBlock(idle, overworld, cell, stone);
        const endpoint = tapAir(first, {
          ...cell,
          x: cell.x + 2,
          z: cell.z + 2,
        });
        const flows: BuildFlow[] = [
          idle,
          first,
          endpoint,
          chooseHeighted(endpoint, "copy"),
          { kind: "pasteAim" },
        ];
        for (const flow of flows) {
          session.setFlow(flow);
          expect(describe.execute(playerId)).toEqual({
            flow: flow.kind,
            clipboardHeld: clipboard,
            pasteMenu: [...(history ? ["undo"] : []), "newCopy", "endPaste"],
          });
          expect(session.flow).toBe(flow);
          expect(session.hasHistory).toBe(history);
          expect(session.clipboard !== undefined).toBe(clipboard);
          expect(describe.editStatus(playerId)).toEqual({
            flow,
            isEditing: false,
          });
        }
        session.beginEdit();
        expect(describe.editStatus(playerId).isEditing).toBe(true);
      },
    ),
  );
});

it("describes a missing session as idle without creating it", () => {
  const repo = new FakeSessions();
  const describe = new DescribeBuild(repo);
  expect(describe.execute(playerId)).toEqual({
    flow: "idle",
    clipboardHeld: false,
    pasteMenu: ["newCopy", "endPaste"],
  });
  expect(describe.editStatus(playerId)).toEqual({
    flow: { kind: "idle" },
    isEditing: false,
  });
  expect(repo.get(playerId)).toBeUndefined();
});
