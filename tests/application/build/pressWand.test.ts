import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { blockTapOf } from "../../../src/domain/build/blockTap";
import { boxOf } from "../../../src/domain/build/box";
import { chooseStairs } from "../../../src/domain/build/flow/stairFlow";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { chooseHeightedFlow } from "../../support/buildSelection";
import { nether } from "./fakes";
import { wandFixture } from "./fakes/pressWand";

const playerId = asPlayerId("builder");
const player = { playerId, dimensionId: nether };
const stone = blockStateOf("minecraft:stone");
const coord = fc.integer({ min: -80, max: 80 });
const cells = fc
  .record({
    x: coord,
    y: fc.integer({ min: 0, max: 80 }),
    z: coord,
  })
  .map(cellOf);

it("samples the final ray before offering the shape or roof contents menu", () => {
  fc.assert(
    fc.property(
      cells,
      fc.constantFrom("gable" as const, "hip" as const),
      (cell, roof) => {
        const { repo, press, world } = wandFixture();
        world.put(cell, stone);
        const end = { ...cell, x: cell.x + 4, z: cell.z + 4 };
        for (const point of [cell, end]) {
          expect(
            press.execute({
              playerId,
              intent: "selectPoint",
              tap: blockTapOf(nether, point),
            }),
          ).toBe("none");
        }
        const session = repo.getOrCreate(playerId);
        const ray = {
          origin: { x: cell.x - 1.5, y: cell.y + 4, z: cell.z + 2.5 },
          direction: { x: 0.8, y: 0.6, z: 0 },
        };
        expect(press.execute({ playerId, intent: "confirmLiveHeight" })).toBe(
          "none",
        );
        expect(session.flow.kind).toBe("baseHeight");
        expect(
          press.execute({ playerId, intent: "confirmLiveHeight", ray }),
        ).toBe("utilityMenu");
        expect(session.flow).toMatchObject({
          kind: "selected",
          selection: {
            box: boxOf(cell, cellOf({ ...end, y: cell.y + 3 })),
          },
        });
        session.setFlowForTest(chooseHeightedFlow(session.flow, roof));
        expect(press.execute({ playerId, intent: "aimHeight" })).toBe("none");
        expect(
          press.execute({
            playerId,
            intent: "aimHeight",
            ray: { ...ray, direction: { x: 1, y: 0, z: 0 } },
          }),
        ).toBe("contentsMenu");
        expect(session.flow).toMatchObject({
          kind: "heightStep",
          liveHeight: 5,
        });
      },
    ),
  );
});

it("fixes a virtual endpoint and offers the stair or terrace form only for a valid goal", () => {
  fc.assert(
    fc.property(
      cells,
      fc.constantFrom("stairs" as const, "terrace" as const),
      fc.boolean(),
      (cell, op, confirmByTap) => {
        const { repo, press, world, feedback } = wandFixture();
        world.put(cell, stone);
        press.execute({
          playerId,
          intent: "selectPoint",
          tap: blockTapOf(nether, cell),
        });
        const ray = {
          origin: { ...cell, x: cell.x - 1, z: cell.z + 2 },
          direction: { x: 1, y: 0, z: 0 },
        };
        const sample = { input: "pointer" as const, ray };
        expect(
          press.execute({
            ...player,
            intent: "fixEndpoint",
            itemUse: { aim: sample, tick: 0, sneaking: false },
          }),
        ).toBe("none");
        const session = repo.getOrCreate(playerId);
        expect(session.flow).toMatchObject({
          kind: "selected",
          taps: { from: cell, to: { ...cell, z: cell.z + 2 } },
        });
        expect(press.execute({ playerId, intent: "openUtilityMenu" })).toBe(
          "utilityMenu",
        );
        session.setFlowForTest(chooseStairs(session.flow, op));
        expect(
          press.execute({
            playerId,
            intent: "confirmStairGoal",
            quietTicks: 9,
          }),
        ).toBe("none");
        expect(feedback.messages.at(-1)?.message).toBe("stairTapGoal");
        const tap = blockTapOf(
          nether,
          cellOf({ x: cell.x + 4, y: cell.y + 2, z: cell.z + 1 }),
          "up",
        );
        expect(
          press.execute({
            playerId,
            intent: "tapStairGoal",
            tap,
            quietTicks: 9,
          }),
        ).toBe("none");
        expect(
          press.execute({
            playerId,
            intent: confirmByTap ? "tapStairGoal" : "confirmStairGoal",
            tap,
            quietTicks: 9,
          }),
        ).toBe(op === "stairs" ? "stairContents" : "terraceMenu");
        expect(session.flow).toMatchObject({
          kind: "stairContents",
          op,
          staircase: { rise: 2, run: 4 },
        });
      },
    ),
  );
});

it("opens paste options on a plain press and refreshes only a completed paste", () => {
  fc.assert(
    fc.property(cells, fc.nat(), (cell, tick) => {
      const { press, repo, structures, feedback, onPasted } = wandFixture();
      const session = repo.getOrCreate(playerId);
      holdClipboard(
        session,
        structureClipboard(boxOf(cell, cell), () => stone, structures),
      );
      session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
      const paste = {
        ...player,
        intent: "pasteAim" as const,
        quietTicks: Infinity,
      };
      expect(
        press.execute({
          ...paste,
          itemUse: { tick, sneaking: false, aim: undefined },
        }),
      ).toBe("pasteMenu");
      expect(
        press.execute({
          ...paste,
          itemUse: { tick, sneaking: true, aim: undefined },
        }),
      ).toBe("none");
      expect(feedback.messages.at(-1)?.message).toBe("pasteTapPosition");
      expect(onPasted).not.toHaveBeenCalled();
      const aim = {
        input: "pointer" as const,
        ray: { origin: cell, direction: { x: 1, y: 0, z: 0 } },
        block: { cell, face: "up" as const },
      };
      session.tapPaste(blockTapOf(nether, cell, "up"), 0, "east");
      expect(
        press.execute({ ...paste, itemUse: { tick, sneaking: true, aim } }),
      ).toBe("none");
      expect(session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
      expect(onPasted).toHaveBeenCalledExactlyOnceWith(playerId, tick);
    }),
  );
});
