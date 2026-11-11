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
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  FakeAimReader,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  nether,
} from "./fakes";

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
      const resolver = new ResolvePasteTarget(repo, new FakeGroundProbe());
      expect(
        resolver.execute({ playerId, dimensionId: nether, aim, tick: 0 }),
      ).toEqual({
        kind: "target",
        target: aimedPasteTarget(clipboard, aim, turn),
      });
      expect(
        resolver.execute({
          playerId,
          dimensionId: nether,
          aim: { ray: aim.ray },
          tick: 0,
        }),
      ).toEqual({ kind: "noTarget" });
    }),
  );
});

it("returns no target without a session or clipboard", () => {
  fc.assert(
    fc.property(aim, (aim) => {
      const repo = new FakeSessions();
      const resolver = new ResolvePasteTarget(repo, new FakeGroundProbe());
      expect(
        resolver.execute({ playerId, dimensionId: nether, aim, tick: 0 }),
      ).toEqual({
        kind: "noTarget",
      });
      expect(repo.get(playerId)).toBeUndefined();
      repo.getOrCreate(playerId);
      expect(
        resolver.execute({ playerId, dimensionId: nether, aim, tick: 0 }),
      ).toEqual({
        kind: "noTarget",
      });
    }),
  );
});

it("draws the same paste box that the press sends to PasteAt", () => {
  fc.assert(
    fc.property(aim, turn, fc.boolean(), (hit, turn, hasBlock) => {
      const { repo, session, clipboard } = setup(turn);
      for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
        session.tickMode({ holding: true });
      const aim: AimResult = hasBlock ? hit : { ray: hit.ray };
      const reader = new FakeAimReader();
      reader.target = aim;
      const feedback = new FakeFeedback();
      const probe = new FakeGroundProbe();
      probe.topOf = (x, z, fromY) => fromY - 1 - ((((x + z) % 7) + 7) % 7);
      const resolver = new ResolvePasteTarget(repo, probe);
      const execute = vi.fn<PasteAt["execute"]>(() => "pasted");
      const press = new PressPasteAim(
        repo,
        { execute } as unknown as PasteAt,
        feedback,
        resolver,
      );
      new ShowPreview(repo, feedback, reader, resolver).execute(0);
      const result = press.execute({
        playerId,
        dimensionId: nether,
        aim,
        tick: 0,
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
      expect(target?.anchor).toEqual(target?.box.min);
      expect(probe.calls.every((call) => call.dimensionId === nether)).toBe(
        true,
      );
      const unsnapped = aimedPasteTarget(clipboard, aim, turn);
      if (!unsnapped) throw new Error("Expected hit target");
      expect(
        probe.calls.every((call) => call.fromY === unsnapped.box.min.y),
      ).toBe(true);
      expect(target?.box.min.y).toBeLessThanOrEqual(unsnapped.box.min.y);
      expect(feedback.previews).toHaveLength(1);
      expect(feedback.previews[0]?.set).toEqual(
        previewPoints(session.flow, { blink: true, pasteBox: target?.box }),
      );
    }),
  );
});

it("refuses no ground with feedback and no paste outline or placement", () => {
  const { repo, session } = setup(0);
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    session.tickMode({ holding: true });
  const probe = new FakeGroundProbe();
  probe.topOf = () => undefined;
  const resolver = new ResolvePasteTarget(repo, probe);
  const reader = new FakeAimReader();
  reader.target = {
    ray: { origin: { x: 0, y: 80, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: { x: 0, y: 80, z: 0 }, face: "east" },
  };
  const feedback = new FakeFeedback();
  const execute = vi.fn<PasteAt["execute"]>(() => "pasted");
  expect(
    resolver.execute({
      playerId,
      dimensionId: nether,
      aim: reader.target,
      tick: 0,
    }),
  ).toEqual({ kind: "noGround" });
  new ShowPreview(repo, feedback, reader, resolver).execute(0);
  expect(
    new PressPasteAim(
      repo,
      { execute } as unknown as PasteAt,
      feedback,
      resolver,
    ).execute({ playerId, dimensionId: nether, aim: reader.target, tick: 0 }),
  ).toBe("refused");
  expect(feedback.messages).toEqual([{ message: "noGround" }]);
  expect(feedback.previews).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
});

it("reuses a preview snap for an unchanged box until it expires, and presses always re-probe", () => {
  const { repo } = setup(0);
  const probe = new FakeGroundProbe();
  const resolver = new ResolvePasteTarget(repo, probe);
  const hit: AimResult = {
    ray: { origin: { x: 0, y: 80, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: { x: 0, y: 80, z: 0 }, face: "up" },
  };
  const resolve = (tick: number, extra: Partial<{ fresh: boolean }> = {}) => {
    probe.calls = [];
    const result = resolver.execute({
      playerId,
      dimensionId: nether,
      aim: hit,
      tick,
      ...extra,
    });
    return { result, probed: probe.calls.length > 0 };
  };
  const first = resolve(0);
  expect(first.probed).toBe(true);
  expect(resolve(BUILD_SPEC.groundCacheTicks - 1)).toEqual({
    result: first.result,
    probed: false,
  });
  expect(resolve(BUILD_SPEC.groundCacheTicks).probed).toBe(true);
  expect(resolve(BUILD_SPEC.groundCacheTicks, { fresh: true }).probed).toBe(
    true,
  );
  probe.calls = [];
  resolver.execute({
    playerId,
    dimensionId: nether,
    aim: { ...hit, block: { cell: { x: 1, y: 80, z: 0 }, face: "up" } },
    tick: BUILD_SPEC.groundCacheTicks,
  });
  expect(probe.calls.length).toBeGreaterThan(0);
  probe.calls = [];
  resolver.execute({
    playerId,
    dimensionId: asDimensionId("minecraft:overworld"),
    aim: { ...hit, block: { cell: { x: 1, y: 80, z: 0 }, face: "up" } },
    tick: BUILD_SPEC.groundCacheTicks,
  });
  expect(probe.calls.length).toBeGreaterThan(0);
});

it("reads one cell per footprint column on flat ground", () => {
  const { repo, clipboard } = setup(0);
  const probe = new FakeGroundProbe();
  new ResolvePasteTarget(repo, probe).execute({
    playerId,
    dimensionId: nether,
    aim: {
      ray: { origin: { x: 0, y: 80, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      block: { cell: { x: 0, y: 80, z: 0 }, face: "up" },
    },
    tick: 0,
  });
  expect(probe.calls).toHaveLength(clipboard.size.x * clipboard.size.z);
  expect(probe.calls.slice(1).every((call) => call.fromY === call.toY)).toBe(
    true,
  );
});
