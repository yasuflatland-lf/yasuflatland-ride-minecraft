import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { SyncTapTarget } from "../../../src/application/build/syncTapTarget";
import { aimedEndPoint } from "../../../src/domain/build/aim/endPoint";
import type { AimSample } from "../../../src/domain/build/aim/sample";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { selectionOf } from "../../../src/domain/build/selection";
import { tapTargetCell } from "../../../src/domain/build/tapTarget";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import { cellKey, FakeWorld, overworld } from "./fakes";

const coord = fc.integer({ min: -32, max: 32 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const playerId = asPlayerId("builder");
const material = blockStateOf("minecraft:stone");

it("shows only a touch player's air endpoint in build mode and a known dimension", () => {
  fc.assert(
    fc.property(cell, cell, fc.boolean(), (from, to, hitBlock) => {
      const baseBox = boxOf(from, to);
      const fixed = {
        from,
        to,
        selection: selectionOf(overworld, baseBox, material),
      };
      const flows: BuildFlow[] = [
        { kind: "idle" },
        { kind: "point1", dimensionId: overworld, cell: from, material },
        { kind: "baseHeight", ...fixed, baseBox, previous: 1 },
        { kind: "selected", ...fixed, menuLevel: "root" },
        { kind: "selected", ...fixed, menuLevel: "build" },
        { kind: "terrainConfirm", ...fixed, op: "removeAbove" },
        { kind: "pasteAim", manualTurn: 0 },
      ];
      const sample: AimSample = {
        input: "touch",
        ray: {
          origin: { x: from.x - 1, y: to.y + 0.5, z: to.z + 0.5 },
          direction: { x: 1, y: 0, z: 0 },
        },
        block: hitBlock ? { cell: to, face: "up" } : undefined,
      };
      for (const flow of flows) {
        for (const aim of [
          sample,
          { ...sample, input: "pointer" as const },
          undefined,
        ]) {
          const end =
            flow.kind === "point1" && aim
              ? aimedEndPoint(flow.cell, aim, OVERWORLD_RANGE)
              : undefined;
          const candidate = tapTargetCell(flow, end);
          for (const dimensionId of [overworld, undefined]) {
            for (const inBuildMode of [true, false]) {
              for (const occupancy of ["air", "solid", "unreadable"]) {
                const blocks = new FakeWorld();
                if (candidate && occupancy === "solid")
                  blocks.put(candidate, material);
                if (candidate && occupancy === "unreadable")
                  blocks.unreadableCells.add(cellKey(candidate));
                const targets = { show: vi.fn(), hide: vi.fn() };
                new SyncTapTarget(blocks, targets).execute({
                  playerId,
                  inBuildMode,
                  flow,
                  aim,
                  dimensionId,
                });
                if (
                  inBuildMode &&
                  aim?.input === "touch" &&
                  candidate &&
                  dimensionId &&
                  occupancy === "air"
                ) {
                  expect(targets.show).toHaveBeenCalledExactlyOnceWith(
                    playerId,
                    { dimensionId, cell: candidate },
                  );
                  expect(targets.hide).not.toHaveBeenCalled();
                } else {
                  expect(targets.hide).toHaveBeenCalledExactlyOnceWith(
                    playerId,
                  );
                  expect(targets.show).not.toHaveBeenCalled();
                }
              }
            }
          }
        }
      }
    }),
  );
});

it("hides a point-one target when the aim plane is behind the player", () => {
  const from = { x: 0, y: 64, z: 0 };
  const targets = { show: vi.fn(), hide: vi.fn() };
  new SyncTapTarget(new FakeWorld(), targets).execute({
    playerId,
    inBuildMode: true,
    flow: { kind: "point1", dimensionId: overworld, cell: from, material },
    aim: {
      input: "touch",
      ray: { origin: { ...from, x: 1 }, direction: { x: 1, y: 0, z: 0 } },
    },
    dimensionId: overworld,
  });
  expect(targets.hide).toHaveBeenCalledExactlyOnceWith(playerId);
  expect(targets.show).not.toHaveBeenCalled();
});
