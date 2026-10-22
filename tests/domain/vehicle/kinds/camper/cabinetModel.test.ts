// The wall cabinet's doors against a small reference model, over arbitrary press and tick
// sequences: what each press returns, the door properties each tick, the compartment and
// plate blocks, and the decor (ADR 0105, 0114).
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { decorFace } from "../../../../../src/domain/vehicle/dock/decor";
import type {
  DockBlock,
  DockCell,
} from "../../../../../src/domain/vehicle/dock/floor";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  AIR,
  localCellAt,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { defined } from "../../../../support/defined";

const SWING = CAMPER_SPEC.doorSwingTicks;
const DOORS = [
  { id: "sink", property: "cabinet_sink_door" },
  { id: "stove", property: "cabinet_stove_door" },
] as const;
type DoorId = (typeof DOORS)[number]["id"];
const ITEMS = ["mug_pair", "toaster", "lava_lamp"] as const;

const endsOf = (door: DoorId) => DECOR_SLOTS.filter((s) => s.door === door);

const action = fc.oneof(
  fc.record({ type: fc.constant("step" as const) }),
  fc.record({
    type: fc.constant("wait" as const),
    ticks: fc.integer({ min: 1, max: SWING + 2 }),
  }),
  fc.record({
    type: fc.constant("press" as const),
    door: fc.constantFrom<DoorId>("sink", "stove"),
    at: fc.constantFrom("compartment" as const, "plate" as const),
    end: fc.constantFrom<0 | 1 | undefined>(0, 1, undefined),
  }),
);

const blockAt = (cells: readonly DockCell[] | undefined, at: Vec3) =>
  cells?.find((c) => cellKey(c) === cellKey(at))?.block;
const propertyValues = (out: DriveStep, name: string) =>
  out.commands
    .filter((c) => c.type === "setProperty" && c.name === name)
    .map((c) => (c.type === "setProperty" ? c.value : undefined));

it("matches a reference model of the cabinet doors over any press and tick sequence (ADR 0105, 0114)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90, 37),
      fc.array(
        fc.tuple(
          fc.constantFrom(...DECOR_SLOTS.filter((s) => s.door !== undefined)),
          fc.constantFrom(...ITEMS),
        ),
        { maxLength: 4 },
      ),
      fc.array(action, { maxLength: 40 }),
      (yaw, initial, actions) => {
        const ctx: TickContext = {
          tick: 0,
          location: { x: 10.2, y: 64.005, z: -8.7 },
          velocity: { x: 0, y: 0, z: 0 },
          onGround: true,
          deckSeatInputs: [],
          solidAt: () => false,
          waterAt: () => false,
          blockTypes: vi.fn((cells: readonly Vec3[]) => cells.map(() => AIR)),
        };
        const drive = new CamperDrive(yaw, {});
        const pose = parkPose(ctx.location, drive.yaw);
        const decor = new Map<string, string>();
        for (const [slot, item] of initial) {
          drive.setDecor(slot.id, item);
          decor.set(slot.id, item);
        }
        const step = () => drive.step(undefined, { ...ctx, tick: ctx.tick++ });
        for (let i = 0; i <= DOCK.ticks; i++) step();
        const model = new Map(
          DOORS.map(({ id }) => [
            id,
            {
              open: false,
              step: 0,
              sent: 0,
              last: Number.NEGATIVE_INFINITY,
            },
          ]),
        );
        const door = (id: DoorId) => defined(model.get(id), id);
        const compartment = (id: DoorId) =>
          localCellAt(pose, defined(endsOf(id)[0], id).cell);
        const plate = (id: DoorId) => ({
          ...localCellAt(pose, { ...defined(endsOf(id)[0], id).cell, x: 0 }),
        });
        const checkStep = () => {
          const out = step();
          for (const { id, property } of DOORS) {
            const d = door(id);
            d.step += Math.sign((d.open ? SWING : 0) - d.step);
            const sent = d.step !== d.sent ? [d.step / SWING] : [];
            d.sent = d.step;
            expect(propertyValues(out, property)).toEqual(sent);
            const [end0, end1] = endsOf(id).map((s) => decor.get(s.id));
            expect(blockAt(out.dock?.cells, compartment(id))).toEqual({
              type: "cabinet",
              face: decorFace(pose.yaw),
              open: d.step > 0,
              ...(end0 === undefined ? {} : { end0 }),
              ...(end1 === undefined ? {} : { end1 }),
            } satisfies DockBlock);
            expect(blockAt(out.dock?.cells, plate(id))?.type).toBe(
              d.open ? "cabinetDoor" : "ceiling",
            );
          }
        };
        for (const a of actions) {
          if (a.type === "step") checkStep();
          else if (a.type === "wait")
            for (let i = 0; i < a.ticks; i++) checkStep();
          else {
            const d = door(a.door);
            const ends = endsOf(a.door);
            const endSlot = a.end === undefined ? undefined : ends[a.end];
            const got = drive.pressStorage(
              a.at === "compartment" ? compartment(a.door) : plate(a.door),
              endSlot && slotPoint(pose, endSlot),
              ctx.tick,
            );
            let want: unknown;
            if (ctx.tick - d.last < SWING) want = undefined;
            else {
              d.last = ctx.tick;
              const taken =
                d.open && a.at === "compartment"
                  ? (endSlot ?? ends.find((s) => decor.has(s.id)))
                  : undefined;
              const item = taken && decor.get(taken.id);
              if (taken && item !== undefined) {
                decor.delete(taken.id);
                want = { kind: "item", item };
              } else {
                d.open = !d.open;
                want = { kind: "door" };
              }
            }
            expect(got).toEqual(want);
          }
          expect(drive.decor()).toEqual(
            DECOR_SLOTS.flatMap(({ id }) => {
              const item = decor.get(id);
              return item === undefined ? [] : [{ slot: id, item }];
            }),
          );
        }
      },
    ),
  );
});
