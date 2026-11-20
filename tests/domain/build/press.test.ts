import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  type BuildFlow,
  chooseHeighted,
  chooseStairs,
  chooseTerrain,
  confirmLiveHeight,
  fixStairGoal,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import {
  type PressIntent,
  type PressRole,
  type PressRoute,
  type PressTarget,
  routePress,
} from "../../../src/domain/build/flow/press";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import { asDimensionId } from "../../../src/domain/shared/ids";

const idle: BuildFlow = { kind: "idle" };
const point1 = tapBlock(
  idle,
  asDimensionId("overworld"),
  { x: 0, y: 0, z: 0 },
  blockStateOf("minecraft:stone"),
);
const baseHeight = tapAir(point1, { x: 2, y: 0, z: 2 });
if (baseHeight.kind !== "baseHeight") throw new Error("Expected live height");
const selected = confirmLiveHeight(baseHeight);
const stairAim = chooseStairs(tapAir(point1, { x: 2, y: 0, z: 0 }), "stairs");
if (stairAim.kind !== "stairAim") throw new Error("Expected stair aim");
const staircase = staircaseToward(stairAim.row, { x: 0, y: 2, z: 4 });
if (!staircase) throw new Error("Expected staircase");
const flows = {
  stairAim,
  stairContents: fixStairGoal(stairAim, staircase),
  idle,
  point1,
  baseHeight,
  selected,
  heightStep: chooseHeighted(selected, "gable"),
  terrainConfirm: chooseTerrain(selected, "removeAbove"),
  pasteAim: beginPasteAim(),
} satisfies Record<BuildFlow["kind"], BuildFlow>;

type Kind = PressIntent["kind"];
const wandTable = {
  // Columns are blockInteract, air (plain and sneak), block or none (plain and sneak).
  idle: [
    "selectPoint",
    "openUtilityMenu",
    "openUtilityMenu",
    "ignore",
    "ignore",
  ],
  point1: ["selectPoint", "fixEndpoint", "openUtilityMenu", "ignore", "ignore"],
  selected: [
    "openUtilityMenu",
    "openUtilityMenu",
    "openUtilityMenu",
    "ignore",
    "ignore",
  ],
  baseHeight: [
    "confirmLiveHeight",
    "confirmLiveHeight",
    "confirmLiveHeight",
    "ignore",
    "ignore",
  ],
  heightStep: ["aimHeight", "aimHeight", "aimHeight", "ignore", "ignore"],
  terrainConfirm: [
    "selectPoint",
    "fixEndpoint",
    "openUtilityMenu",
    "ignore",
    "ignore",
  ],
  stairAim: [
    "fixStairGoal",
    "fixStairGoal",
    "fixStairGoal",
    "fixStairGoal",
    "fixStairGoal",
  ],
  stairContents: ["ignore", "ignore", "ignore", "ignore", "ignore"],
  pasteAim: ["ignore", "pasteAim", "pasteAim", "pasteAim", "pasteAim"],
} satisfies Record<BuildFlow["kind"], [Kind, Kind, Kind, Kind, Kind]>;
const routes: PressRoute[] = ["itemUse", "blockInteract"];
const targets: PressTarget[] = ["air", "block", "none"];
const controlTable = {
  undo: "undo",
  pasteRotate: "rotateClipboard",
  pastePlace: "pasteAim",
} satisfies Record<Exclude<PressRole, "wand">, Kind>;
const controlRoles = ["undo", "pasteRotate", "pastePlace"] as const;
const roles: PressRole[] = ["wand", ...controlRoles];
const sneakingValues = [false, true];

it.each(Object.values(flows))("routes wand presses in $kind", (flow) => {
  const [block, air, sneakAir, other, sneakOther] = wandTable[flow.kind];
  for (const target of targets) {
    for (const sneaking of sneakingValues) {
      expect(
        routePress({
          flow,
          role: "wand",
          route: "blockInteract",
          target,
          sneaking,
        }),
      ).toEqual({ kind: block });
    }
    expect(
      routePress({
        flow,
        role: "wand",
        route: "itemUse",
        target,
        sneaking: false,
      }),
    ).toEqual({ kind: target === "air" ? air : other });
    expect(
      routePress({
        flow,
        role: "wand",
        route: "itemUse",
        target,
        sneaking: true,
      }),
    ).toEqual({ kind: target === "air" ? sneakAir : sneakOther });
  }
});

it.each(controlRoles)("routes %s on both input routes", (role) => {
  for (const route of routes) {
    expect(
      routePress({ flow: idle, role, route, target: "block", sneaking: false }),
    ).toEqual({ kind: controlTable[role] });
  }
});

it("returns a known intent for every combination of press inputs", () => {
  const knownKinds = [
    ...Object.values(wandTable).flat(),
    ...Object.values(controlTable),
    "rotateSelection",
  ];
  const choices = Object.values(flows);
  const examples = choices.flatMap((flow) =>
    roles.flatMap((role) =>
      routes.flatMap((route) =>
        targets.flatMap((target) =>
          sneakingValues.map(
            (sneaking) => [{ flow, role, route, target, sneaking }] as const,
          ),
        ),
      ),
    ),
  );
  fc.assert(
    fc.property(
      fc.record({
        flow: fc.constantFrom(...choices),
        role: fc.constantFrom(...roles),
        route: fc.constantFrom(...routes),
        target: fc.constantFrom(...targets),
        sneaking: fc.boolean(),
      }),
      (input) => {
        expect(knownKinds).toContain(routePress(input).kind);
      },
    ),
    { examples },
  );
});

it("routes Paste Rotate to the selected box and otherwise to the clipboard on either route", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...Object.values(flows)),
      fc.constantFrom(...routes),
      fc.constantFrom(...targets),
      fc.boolean(),
      (flow, route, target, sneaking) => {
        for (const role of controlRoles)
          expect(routePress({ flow, role, route, target, sneaking })).toEqual({
            kind:
              role === "pasteRotate" && flow.kind === "selected"
                ? "rotateSelection"
                : controlTable[role],
          });
      },
    ),
  );
});
