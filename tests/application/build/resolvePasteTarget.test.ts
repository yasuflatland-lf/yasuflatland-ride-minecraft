import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { PasteAt } from "../../../src/application/build/pasteAt";
import type { AimResult } from "../../../src/application/build/ports/aim";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { ShowPreview } from "../../../src/application/build/showPreview";
import type { Face } from "../../../src/domain/build/aim/face";
import { AIR } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { aimedPasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import {
  effectiveTurn,
  FACINGS,
  type Facing,
  facingVector,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
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
  fakeSyncTapTarget,
  nether,
} from "./fakes";

const playerId = asPlayerId("p");
const coordinate = fc.integer({ min: -100, max: 100 });
const aim = fc.record({
  input: fc.constant("pointer" as const),
  ray: fc.constant({
    origin: { x: 0, y: 64, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
  }),
  block: fc.record({
    cell: fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    face: fc.constantFrom<Face>("up", "down", "north", "south", "east", "west"),
  }),
});
const facing = fc.constantFrom(...FACINGS);

function setup(facing?: Facing) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const clipboard = structureClipboard(
    boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }),
  );
  holdClipboard(session, clipboard);
  session.setFlow({ kind: "pasteAim", manualTurn: 0, facing });
  return { repo, session, clipboard };
}

it("matches the domain target for every face and turn, and returns no target on air", () => {
  fc.assert(
    fc.property(aim, facing, (hit, facing) => {
      const aim = {
        ...hit,
        ray: { ...hit.ray, direction: facingVector(facing) },
      };
      const { repo, clipboard } = setup();
      const resolver = new ResolvePasteTarget(repo, new FakeGroundProbe());
      expect(
        resolver.execute({ playerId, dimensionId: nether, aim, tick: 0 }),
      ).toEqual({
        kind: "target",
        target: aimedPasteTarget(
          clipboard,
          aim,
          turnBetween(clipboard.facing, facing),
          facing,
        ),
      });
      expect(
        resolver.execute({
          playerId,
          dimensionId: nether,
          aim: { input: aim.input, ray: aim.ray },
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
    fc.property(
      aim,
      facing,
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom(0, 1, 2, 3),
      (hit, facing, hasBlock, sneaking, manualTurn) => {
        const { repo, session, clipboard } = setup();
        for (let i = 0; i < manualTurn; i++) session.rotatePaste();
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          session.tickMode({ holding: true });
        const ray = { ...hit.ray, direction: facingVector(facing) };
        const aim: AimResult = hasBlock
          ? { ...hit, ray }
          : { input: hit.input, ray };
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
        new ShowPreview(
          repo,
          feedback,
          reader,
          resolver,
          fakeSyncTapTarget(),
        ).execute(0);
        const result = press.execute({
          playerId,
          dimensionId: nether,
          aim,
          tick: 0,
          sneaking,
        });
        if (!hasBlock) {
          expect(result).toBe(sneaking ? "ignored" : "menu");
          expect(execute).not.toHaveBeenCalled();
          expect(feedback.previews).toEqual([]);
          return;
        }
        if (!sneaking) {
          expect(result).toBe("menu");
          expect(execute).not.toHaveBeenCalled();
          expect(feedback.previews).toHaveLength(1);
          return;
        }
        expect(result).toBe("pasted");
        expect(execute).toHaveBeenCalledTimes(1);
        const target = execute.mock.calls[0]?.[0].target;
        expect(target).toBeDefined();
        expect(target?.anchor).toEqual(target?.box.min);
        expect(target?.turn).toBe(
          effectiveTurn(clipboard.facing, facing, manualTurn),
        );
        expect(probe.calls.every((call) => call.dimensionId === nether)).toBe(
          true,
        );
        const unsnapped = aimedPasteTarget(
          clipboard,
          aim,
          effectiveTurn(clipboard.facing, facing, manualTurn),
          facing,
        );
        if (!unsnapped) throw new Error("Expected hit target");
        expect(
          probe.calls.every((call) => call.fromY === unsnapped.box.min.y),
        ).toBe(true);
        expect(target?.box.min.y).toBeLessThanOrEqual(unsnapped.box.min.y);
        expect(feedback.previews).toHaveLength(1);
        expect(feedback.previews[0]?.set).toEqual(
          previewPoints(session.flow, { blink: true, pasteBox: target?.box }),
        );
      },
    ),
  );
});

it("refuses no ground with feedback and no paste outline or placement", () => {
  const { repo, session } = setup();
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    session.tickMode({ holding: true });
  const probe = new FakeGroundProbe();
  probe.topOf = () => undefined;
  const resolver = new ResolvePasteTarget(repo, probe);
  const reader = new FakeAimReader();
  reader.target = {
    input: "pointer",
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
  new ShowPreview(
    repo,
    feedback,
    reader,
    resolver,
    fakeSyncTapTarget(),
  ).execute(0);
  expect(
    new PressPasteAim(
      repo,
      { execute } as unknown as PasteAt,
      feedback,
      resolver,
    ).execute({
      playerId,
      dimensionId: nether,
      aim: reader.target,
      tick: 0,
      sneaking: true,
    }),
  ).toBe("refused");
  expect(feedback.messages).toEqual([{ message: "noGround" }]);
  expect(feedback.previews).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
});

it("reuses a preview snap for an unchanged box until it expires, and presses always re-probe", () => {
  const { repo } = setup();
  const probe = new FakeGroundProbe();
  const resolver = new ResolvePasteTarget(repo, probe);
  const hit: AimResult = {
    input: "pointer",
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
  const { repo, clipboard } = setup();
  const probe = new FakeGroundProbe();
  new ResolvePasteTarget(repo, probe).execute({
    playerId,
    dimensionId: nether,
    aim: {
      input: "pointer",
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

it("keeps the previous facing for diagonal hysteresis and vertical gaze", () => {
  fc.assert(
    fc.property(fc.double({ min: 45, max: 54.9, noNaN: true }), (degrees) => {
      const { repo, session } = setup();
      const resolver = new ResolvePasteTarget(repo, new FakeGroundProbe());
      const resolve = (direction: { x: number; y: number; z: number }) =>
        resolver.execute({
          playerId,
          dimensionId: nether,
          tick: 0,
          aim: {
            input: "pointer",
            ray: { origin: { x: 0, y: 80, z: 0 }, direction },
            block: { cell: { x: 0, y: 80, z: 0 }, face: "up" },
          },
        });
      const first = resolve(facingVector("north"));
      const radians = (degrees * Math.PI) / 180;
      expect(
        resolve({ x: Math.sin(radians), y: 0, z: -Math.cos(radians) }),
      ).toEqual(first);
      expect(resolve({ x: 0, y: -1, z: 0 })).toEqual(first);
      expect(session.pasteTurn).toBe(3);
      resolve(facingVector("east"));
      expect(session.pasteTurn).toBe(0);
    }),
  );
});

it("uses the clipboard facing for an initial vertical gaze", () => {
  fc.assert(
    fc.property(facing, (facing) => {
      const { repo, session, clipboard } = setup();
      session.completeCopy(
        selectionOf(
          nether,
          boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }),
          AIR,
        ),
        { ...clipboard, facing },
      );
      new ResolvePasteTarget(repo, new FakeGroundProbe()).execute({
        playerId,
        dimensionId: nether,
        tick: 0,
        aim: {
          input: "pointer",
          ray: {
            origin: { x: 0, y: 80, z: 0 },
            direction: { x: 0, y: 1, z: 0 },
          },
        },
      });
      expect(session.flow).toEqual({ kind: "pasteAim", manualTurn: 0, facing });
      expect(session.pasteTurn).toBe(0);
    }),
  );
});

it("never covers the aimed block on a side face for any gaze", () => {
  fc.assert(
    fc.property(
      aim,
      facing,
      fc.constantFrom<Face>("north", "east", "south", "west"),
      (hit, facing, face) => {
        const { repo } = setup();
        const cell = hit.block.cell;
        const result = new ResolvePasteTarget(
          repo,
          new FakeGroundProbe(),
        ).execute({
          playerId,
          dimensionId: nether,
          tick: 0,
          aim: {
            input: "pointer",
            ray: { ...hit.ray, direction: facingVector(facing) },
            block: { cell, face },
          },
        });
        expect(result.kind).toBe("target");
        if (result.kind !== "target") throw new Error("Missing target");
        const { min, max } = result.target.box;
        expect(
          cell.x < min.x || cell.x > max.x || cell.z < min.z || cell.z > max.z,
        ).toBe(true);
      },
    ),
  );
});
