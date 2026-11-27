import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { blockTapOf } from "../../../src/domain/build/blockTap";
import { boxOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import { previewModel } from "../../../src/domain/build/preview/preview";
import {
  effectiveTurn,
  FACINGS,
  type Facing,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { BlockFace } from "../../../src/domain/shared/blockFace";
import { cellOf } from "../../../src/domain/shared/cells";
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
  FakeWorld,
  fakeSyncTapTarget,
  nether,
} from "./fakes";

const playerId = asPlayerId("p");
const coordinate = fc.integer({ min: -100, max: 100 });
const tapped = fc
  .record({
    cell: fc
      .record({ x: coordinate, y: coordinate, z: coordinate })
      .map(cellOf),
    face: fc.constantFrom<BlockFace | undefined>(
      "up",
      "down",
      "north",
      "south",
      "east",
      "west",
      undefined,
    ),
  })
  .map(({ cell, face }) => blockTapOf(nether, cell, face));
const facing = fc.constantFrom(...FACINGS);

function setup(facing?: Facing) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const clipboard = structureClipboard(
    boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 1, y: 2, z: 3 })),
  );
  holdClipboard(session, clipboard);
  session.setFlowForTest({ kind: "pasteAim", manualTurn: 0, facing });
  return { repo, session, clipboard };
}

it("matches the domain target for every face and turn, including a tap without a face", () => {
  fc.assert(
    fc.property(tapped, facing, (tap, facing) => {
      const { repo, clipboard } = setup(facing);
      const resolver = new ResolvePasteTarget(repo, new FakeGroundProbe());
      expect(
        resolver.execute({ playerId, dimensionId: nether, tap, tick: 0 }),
      ).toEqual({
        kind: "target",
        target: pasteTarget(
          clipboard,
          tap.cell,
          tap.face ?? "up",
          turnBetween(clipboard.facing, facing),
        ),
      });
    }),
  );
});

it("returns no target without a session or clipboard", () => {
  fc.assert(
    fc.property(tapped, (tap) => {
      const repo = new FakeSessions();
      const resolver = new ResolvePasteTarget(repo, new FakeGroundProbe());
      expect(
        resolver.execute({ playerId, dimensionId: nether, tap, tick: 0 }),
      ).toEqual({
        kind: "noTarget",
      });
      expect(repo.get(playerId)).toBeUndefined();
      repo.getOrCreate(playerId);
      expect(
        resolver.execute({ playerId, dimensionId: nether, tap, tick: 0 }),
      ).toEqual({
        kind: "noTarget",
      });
    }),
  );
});

it("draws the same paste box that the press sends to PasteAt", () => {
  fc.assert(
    fc.property(
      tapped,
      facing,
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom(0, 1, 2, 3),
      (tap, facing, hasBlock, sneaking, manualTurn) => {
        const { repo, session, clipboard } = setup();
        for (let i = 0; i < manualTurn; i++) session.rotatePaste();
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          session.tickMode({ holding: true });
        if (hasBlock) session.tapPaste(tap, 0, facing);
        const reader = new FakeAimReader();
        const read = vi.spyOn(reader, "aim");
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
          { facingOf: () => facing },
        );
        new ShowPreview(
          repo,
          feedback,
          reader,
          resolver,
          fakeSyncTapTarget(),
          new FakeWorld(),
        ).execute(0);
        const result = press.execute({
          playerId,
          dimensionId: nether,
          quietTicks: Infinity,
          tick: 0,
          sneaking,
        });
        expect(read).not.toHaveBeenCalled();
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
        const unsnapped = pasteTarget(
          clipboard,
          tap.cell,
          tap.face ?? "up",
          effectiveTurn(clipboard.facing, facing, manualTurn),
        );
        if (!unsnapped) throw new Error("Expected hit target");
        expect(
          probe.calls.every((call) => call.fromY === unsnapped.box.min.y),
        ).toBe(true);
        expect(target?.corner).toEqual({
          ...unsnapped.corner,
          y: target?.box.min.y,
        });
        expect(target?.box.min.y).toBeLessThanOrEqual(unsnapped.box.min.y);
        expect(feedback.previews).toHaveLength(1);
        expect(feedback.previews[0]?.set).toEqual(
          previewModel(session.flow, { blink: true, pasteTarget: target }).set,
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
  const tap = blockTapOf(nether, cellOf({ x: 0, y: 80, z: 0 }), "up");
  session.tapPaste(tap, 0, "east");
  const feedback = new FakeFeedback();
  const execute = vi.fn<PasteAt["execute"]>(() => "pasted");
  expect(
    resolver.execute({ playerId, dimensionId: nether, tap, tick: 0 }),
  ).toEqual({ kind: "noGround" });
  new ShowPreview(
    repo,
    feedback,
    reader,
    resolver,
    fakeSyncTapTarget(),
    new FakeWorld(),
  ).execute(0);
  const press = new PressPasteAim(
    repo,
    { execute } as unknown as PasteAt,
    feedback,
    resolver,
    { facingOf: () => "east" },
  );
  expect(
    press.execute({
      playerId,
      dimensionId: nether,
      tick: 0,
      quietTicks: Infinity,
      sneaking: true,
    }),
  ).toBe("refused");
  expect(feedback.messages).toEqual([{ message: "noGround" }]);
  expect(feedback.previews).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
});

it("caches unchanged preview snaps until expiry and re-probes on a press", () => {
  const { repo } = setup();
  const probe = new FakeGroundProbe();
  const resolver = new ResolvePasteTarget(repo, probe);
  const hit = blockTapOf(nether, cellOf({ x: 0, y: 80, z: 0 }), "up");
  const resolve = (tick: number, extra: Partial<{ fresh: boolean }> = {}) => {
    probe.calls = [];
    const result = resolver.execute({
      playerId,
      dimensionId: nether,
      tap: hit,
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
    tap: { ...hit, cell: cellOf({ x: 1, y: 80, z: 0 }) },
    tick: BUILD_SPEC.groundCacheTicks,
  });
  expect(probe.calls.length).toBeGreaterThan(0);
  probe.calls = [];
  resolver.execute({
    playerId,
    dimensionId: asDimensionId("minecraft:overworld"),
    tap: blockTapOf(
      asDimensionId("minecraft:overworld"),
      cellOf({ x: 1, y: 80, z: 0 }),
      "up",
    ),
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
    tap: blockTapOf(nether, cellOf({ x: 0, y: 80, z: 0 }), "up"),
    tick: 0,
  });
  expect(probe.calls).toHaveLength(clipboard.size.x * clipboard.size.z);
  expect(probe.calls.slice(1).every((call) => call.fromY === call.toY)).toBe(
    true,
  );
});

it("rejects a tap in another dimension without probing ground", () => {
  const { repo } = setup();
  const probe = new FakeGroundProbe();
  const tap = blockTapOf(
    asDimensionId("minecraft:overworld"),
    cellOf({ x: 0, y: 80, z: 0 }),
    "up",
  );
  expect(
    new ResolvePasteTarget(repo, probe).execute({
      playerId,
      dimensionId: nether,
      tap,
      tick: 0,
    }),
  ).toEqual({ kind: "noTarget" });
  expect(probe.calls).toEqual([]);
});
