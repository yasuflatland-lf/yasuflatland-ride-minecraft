// Departure of a camper whose storage adds a test-only unit shaped like the planned fridge,
// with its plates in the room's inside layers: the drive reads those plate cells with
// ownPlateBlock instead of as cargo (ADR 0121).
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import { STORAGE_DOORS } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  AIR,
  cargoCells,
  exitCells,
  parkPose,
  slotCells,
  storagePlateChecks,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";

vi.mock(
  "../../../../../src/domain/vehicle/kinds/camper/furniture",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../../src/domain/vehicle/kinds/camper/furniture")
      >();
    const { storageDoors } = await import(
      "../../../../../src/domain/vehicle/kinds/camper/dooredStorage"
    );
    const door = (id: string, layer: number) => ({
      id,
      compartment: { x: -1, z: 1, layer },
      plate: { x: 0, z: 1, layer },
      hinge: 1 as const,
      slots: [],
    });
    const fridgeLike = storageDoors<string>([
      {
        pairKind: "shelf",
        doors: [door("fridge_top", 2), door("fridge_bottom", 1)],
        compartmentBlock: ({ face, open }) => ({ type: "cabinet", face, open }),
        plateBlock: ({ face }) => ({ type: "cabinetDoor", face }),
        plateBlockName: "fridge_like_door",
      },
    ]);
    return {
      ...original,
      STORAGE_DOORS: [...original.STORAGE_DOORS, ...fridgeLike],
    };
  },
);

const PUSH = { moveX: 0, moveY: 1, jump: false };
const INSIDE_PLATES = storagePlateChecks(
  { x: 0, y: 0, z: 0, yaw: 0 },
  STORAGE_DOORS,
);

function parked(yaw: number) {
  const blocks = new Map<string, string>();
  const blockTypes = vi.fn(
    (cells: readonly { x: number; y: number; z: number }[]) =>
      cells.map((c) => blocks.get(cellKey(c)) ?? AIR),
  );
  let tick = 0;
  const ctx: TickContext = {
    tick,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes,
  };
  const drive = new CamperDrive(yaw, {});
  const step = (raw?: typeof PUSH) => drive.step(raw, { ...ctx, tick: tick++ });
  for (let i = 0; i <= DOCK.ticks; i++) step();
  return { blocks, blockTypes, pose: parkPose(ctx.location, drive.yaw), step };
}

it("has the test-only unit's two plates in the inside layers", () => {
  expect(INSIDE_PLATES.map(({ door }) => door.id)).toEqual([
    "fridge_top",
    "fridge_bottom",
  ]);
});

it("reads the inside plate cells between the slot and exit cells on departure, and leaves only with air or the door's own plate there (ADR 0121)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -180, max: 179 }),
      fc.nat({ max: INSIDE_PLATES.length - 1 }),
      fc.constantFrom(
        "yasu_ride:fridge_like_door",
        "yasu_ride:camper_cabinet_door",
        "minecraft:stone",
        AIR,
      ),
      (yaw, plateIndex, typeId) => {
        const f = parked(yaw);
        const plates = storagePlateChecks(f.pose, STORAGE_DOORS);
        const cell = plates[plateIndex]?.cell;
        if (cell) f.blocks.set(cellKey(cell), typeId);
        const out = f.step(PUSH);
        expect(f.blockTypes.mock.calls.at(-1)?.[0]).toEqual([
          ...cargoCells(f.pose),
          ...slotCells(f.pose),
          ...plates.map((p) => p.cell),
          ...exitCells(f.pose),
        ]);
        const leaves =
          typeId === AIR || typeId === "yasu_ride:fridge_like_door";
        expect(out.depart !== undefined).toBe(leaves);
        expect(out.message).toBe(leaves ? undefined : "clear_cargo");
      },
    ),
  );
});
