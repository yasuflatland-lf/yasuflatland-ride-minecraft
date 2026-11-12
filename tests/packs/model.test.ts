import { readFileSync } from "node:fs";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { DOOR_BY_SEAT } from "../../src/domain/vehicle/kinds/suv/entity";
import { SUV_PROFILE } from "../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";
import { turnedCorners } from "../support/geometry";
import { startPythonWorker } from "../support/pythonWorker";
import { assertOneAxis, multipleAxes } from "./oneAxis";

const python = startPythonWorker();
afterAll(() => python.close());

type Vec3 = [number, number, number];

const dimensions = JSON.parse(
  await python.run(
    [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "d = load_tool('suv_dims')",
      "print(json.dumps({k: v for k, v in vars(d).items() if k.isupper() and isinstance(v, (int, float))}))",
    ].join("\n"),
  ),
) as {
  SEAT_Y: number;
  SIZE_SCALE: number;
  HOOD_TOP_Y: number;
  WINDSHIELD_RAIL_HEIGHT: number;
  WINDSHIELD_LEAN: number;
  ROOF_Y: number;
  ROOF_TOP: number;
  FLOOR_Y: number;
  DASH_FACE_Z: number;
  INTERIOR_SHIFT_Z: number;
  HOOD_REAR_Z: number;
  FOLDED_WHEEL_TOP_Y: number;
  ARM_ROOT_X: number;
  ARM_ROOT_Y: number;
  ARM_THICK: number;
  WINDOW_BOTTOM_Y: number;
  WINDOW_TOP_Y: number;
  D: number;
  SPARE_Y: number;
  SPARE_Z: number;
  FRONT_AXLE_Z: number;
};
const SIZE_SCALE = dimensions.SIZE_SCALE;
const scaled = (value: number) => Number((value * SIZE_SCALE).toFixed(12));

interface Cube {
  uv?: Record<string, { uv: [number, number] }>;
  origin: Vec3;
  size: Vec3;
  pivot?: Vec3;
  rotation?: Vec3;
}

interface Bone {
  name: string;
  parent?: string;
  pivot?: Vec3;
  cubes?: Cube[];
  locators?: Record<string, Vec3>;
}

const geo = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
);
const geometry = geo["minecraft:geometry"][0];
const bones = new Map<string, Bone>(
  geometry.bones.map((b: Bone) => [b.name, b]),
);
const anims = JSON.parse(
  readFileSync("packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json", "utf8"),
).animations;

// How far the hover animation moves each folded wheel out (ADR 0218). The
// translations are generated from suv_dims.py by sync_animation, so the glow
// and arms must follow the generated animation.
const FOLD_OUT = Math.abs(
  anims["animation.yasu_ride.suv.wheels_folded"].bones.wheel_fl.position[0],
);

function pivot(name: string): Vec3 {
  const p = bones.get(name)?.pivot;
  if (!p) throw new Error(`${name} has no pivot`);
  return p;
}

function minus(p: Vec3, q: Vec3): Vec3 {
  return [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
}

function dot(p: Vec3, q: Vec3): number {
  return p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
}

function cross(p: Vec3, q: Vec3): Vec3 {
  return [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
}

// Separating axes of two oriented boxes: their edges and each pair's cross product.
// Testing turned corners catches a sloping flare even when its AABB overlaps a tire.
function separated(a: Vec3[], b: Vec3[]): boolean {
  const edges = (points: Vec3[]) =>
    [1, 2, 4].map((i) => minus(points[i] as Vec3, points[0] as Vec3));
  const edgesA = edges(a);
  const edgesB = edges(b);
  const axes = [
    ...edgesA,
    ...edgesB,
    ...edgesA.flatMap((u) => edgesB.map((v) => cross(u, v))),
  ];
  return axes.some((axis) => {
    const length = Math.hypot(...axis);
    if (length < 1e-9) return false;
    const unit = axis.map((v) => v / length) as Vec3;
    const projectedA = a.map((p) => dot(p, unit));
    const projectedB = b.map((p) => dot(p, unit));
    return (
      Math.max(...projectedA) <= Math.min(...projectedB) + 1e-8 ||
      Math.max(...projectedB) <= Math.min(...projectedA) + 1e-8
    );
  });
}

function spun(points: Vec3[], hub: Vec3, radians: number): Vec3[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([x, y, z]) => [
    x,
    hub[1] + (y - hub[1]) * cos - (z - hub[2]) * sin,
    hub[2] + (y - hub[1]) * sin + (z - hub[2]) * cos,
  ]);
}

// Standard Bedrock head plus outer skin layer, client scale, and ADR 0029's rider drop.
const RIDER_HEAD_PX = (24 + 8 + 0.5) * 0.9375 - 0.4 * 16;
const RIDER_HEAD_HALF_PX = (4 + 0.5) * 0.9375;

it("keeps every seated player's head beneath the SUV roof and behind the raked windshield with half a pixel to spare", () => {
  const seats = JSON.parse(
    readFileSync("packs/yasu_ride_bp/entities/yasu_ride/suv.se.json", "utf8"),
  )["minecraft:entity"].components["minecraft:rideable"].seats as {
    position: Vec3;
  }[];
  const roof = bones
    .get("body")
    ?.cubes?.filter(
      (cube) =>
        !cube.rotation &&
        cube.origin[1] > scaled(dimensions.ROOF_Y - 1) &&
        cube.size[0] > 20 &&
        cube.size[2] > 30 &&
        cube.size[1] < 1,
    )
    .sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])[0];
  if (!roof) throw new Error("Missing SUV roof slab");
  // The sealed glass and the frame parts that lean with it (ADR 0170).
  const lean = bones.get("windows_sealed")?.cubes?.[0]?.rotation?.[0];
  const windshield = ["body", "windows_sealed"].flatMap((name) => {
    const bone = bones.get(name);
    return (bone?.cubes ?? [])
      .filter((cube) => cube.rotation?.[0] === lean)
      .map((cube) => turnedCorners(bone as Bone, cube));
  });
  expect(lean).toBeDefined();
  expect(windshield.length).toBeGreaterThanOrEqual(4);
  expect(seats).toHaveLength(4);
  for (const seat of seats) {
    expect(seat.position[1]).toBe(dimensions.SEAT_Y);
    const top = seat.position[1] * 16 + RIDER_HEAD_PX;
    expect(top + 0.5).toBeLessThanOrEqual(roof.origin[1]);
    // The head box grown by the margin; the model's front is -z (ADR 0009).
    const reach = RIDER_HEAD_HALF_PX + 0.5;
    const [x, z] = [seat.position[0] * 16, -seat.position[2] * 16];
    const head: Vec3[] = [];
    for (const dx of [-reach, reach])
      for (const y of [top - 2 * RIDER_HEAD_HALF_PX - 0.5, top + 0.5])
        for (const dz of [-reach, reach]) head.push([x + dx, y, z + dz]);
    for (const part of windshield) expect(separated(head, part)).toBe(true);
  }
});

// The dashboard, gauges and their fittings use the fixed painted blocks of the atlas, below the
// swatch rows; the hull's own parts use plain swatches.
const isPaintedInterior = (cube: Cube) =>
  Object.values(cube.uv ?? {}).some(({ uv: [, v] }) => v >= 168);

const cabinParts = JSON.parse(
  await python.run(
    [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "dash = load_tool('suv_dash')",
      "gauges = load_tool('suv_gauges')",
      "export = load_tool('suv_export')",
      "cubes = load_tool('suv_cubes')",
      "geometry = {'description': {'visible_bounds_width': 1, 'visible_bounds_height': 1, 'visible_bounds_offset': [0, 0, 0]}, 'bones': [{'name': 'body', 'pivot': [0, 0, 0], 'cubes': [*dash.dash_slab_cubes(), *dash.dash_fittings_cubes(), *gauges.gauge_cluster_cubes()]}]}",
      "export.turn_around(geometry['bones'])",
      "export.scale_geometry(geometry)",
      "print(json.dumps({'dashboard': geometry['bones'][0]['cubes'], 'seatUvs': [cubes.uv(name) for name in ('seat', 'seat_pleat')]}))",
    ].join("\n"),
  ),
) as { dashboard: Cube[]; seatUvs: Cube["uv"][] };

const rideableSeats = (): { position: Vec3 }[] =>
  JSON.parse(
    readFileSync("packs/yasu_ride_bp/entities/yasu_ride/suv.se.json", "utf8"),
  )["minecraft:entity"].components["minecraft:rideable"].seats;

it("keeps every rider's eye at least 5 entity pixels below the roof with an unobstructed windshield horizon", () => {
  const body = bones.get("body");
  const windows = bones.get("windows_sealed");
  const glass = windows?.cubes?.find((cube) => cube.rotation?.[0]);
  const roof = body?.cubes
    ?.filter(
      (cube) =>
        !cube.rotation &&
        cube.origin[1] > scaled(dimensions.ROOF_Y - 1) &&
        cube.size[0] > 20 &&
        cube.size[2] > 30 &&
        cube.size[1] < 1,
    )
    .sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])[0];
  if (!body || !windows || !glass || !roof)
    throw new Error("Missing cabin shell");
  const glassYs = turnedCorners(windows, glass).map((point) => point[1]);
  const dashboard = cabinParts.dashboard.map((expected) => {
    const cube = body.cubes?.find((candidate) =>
      (["origin", "size", "pivot", "rotation"] as const).every((key) => {
        const a = candidate[key];
        const b = expected[key];
        return a && b
          ? a.every(
              (value, axis) => Math.abs(value - (b[axis] as number)) < 1e-8,
            )
          : a === b;
      }),
    );
    if (!cube)
      throw new Error(`Missing dashboard cube ${JSON.stringify(expected)}`);
    expect(cube.uv).toEqual(expected.uv);
    return cube;
  });
  for (const {
    position: [, , seatZ],
  } of rideableSeats()) {
    expect(
      dashboard.every((cube) =>
        turnedCorners(body, cube).every((point) => point[2] < -seatZ * 16),
      ),
    ).toBe(true);
  }
  for (const {
    position: [, seatY],
  } of rideableSeats()) {
    const eye = seatY * 16 + (1.62 - 0.4) * 16;
    expect(roof.origin[1] - eye).toBeGreaterThanOrEqual(5);
    expect(eye).toBeGreaterThan(Math.min(...glassYs));
    expect(eye).toBeLessThan(Math.max(...glassYs));
    expect(eye).toBeGreaterThan(scaled(dimensions.HOOD_TOP_Y));
    for (const cube of dashboard)
      expect(eye).toBeGreaterThan(
        Math.max(...turnedCorners(body, cube).map((point) => point[1])),
      );
  }
});

it("keeps every seated torso clear of the body and doors except seat upholstery", () => {
  const shell = [...bones.values()].filter(
    (bone) => bone.name === "body" || bone.name.startsWith("door_"),
  );
  const isSeat = (cube: Cube) =>
    cabinParts.seatUvs.some(
      (uv) => JSON.stringify(uv) === JSON.stringify(cube.uv),
    );
  expect(
    shell.flatMap((bone) => bone.cubes ?? []).filter(isSeat).length,
  ).toBeGreaterThan(40);
  for (const [
    index,
    {
      position: [x, y, z],
    },
  ] of rideableSeats().entries()) {
    const torso: Vec3[] = [];
    for (const dx of [-4 * 0.9375, 4 * 0.9375])
      for (const height of [12 * 0.9375, 24 * 0.9375])
        for (const dz of [-2 * 0.9375, 2 * 0.9375])
          torso.push([x * 16 + dx, y * 16 - 6.4 + height, -z * 16 + dz]);
    for (const bone of shell)
      for (const cube of bone.cubes ?? []) {
        if (isSeat(cube)) continue;
        expect(
          separated(torso, turnedCorners(bone, cube)),
          `seat ${index}, ${bone.name}: ${JSON.stringify(cube)}`,
        ).toBe(true);
      }
  }
});

describe("SUV model (ADR 0009)", () => {
  it("keeps every gauge face, ring and hub on the cabin side of the dash slab", () => {
    const body = bones.get("body");
    if (!body) throw new Error("Missing SUV body");
    const cubes = body.cubes ?? [];
    const slabs = cubes.filter(
      (c) =>
        !c.rotation &&
        c.size[0] > 20 &&
        c.origin[1] === scaled(13) &&
        c.size[1] > 5 &&
        c.size[2] < 2,
    );
    expect(slabs).toHaveLength(1);
    const slab = slabs[0];
    if (!slab) throw new Error("Missing dash slab");
    // Export turns +z toward the hood into -z, then scales by SIZE_SCALE.
    const rearFace = slab.origin[2] + slab.size[2];
    const textured = cubes.filter((c) =>
      Object.values(c.uv ?? {}).some(
        ({ uv: [u, v] }) => u >= 320 && u < 448 && v >= 168 && v < 256,
      ),
    );
    // The gauges block also contains steering leather; dial faces are unrotated.
    const faces = textured.filter((c) => !c.rotation);
    expect(faces).toHaveLength(3);
    const centers = faces.map((c) => [
      c.origin[0] + c.size[0] / 2,
      c.origin[1] + c.size[1] / 2,
    ]);
    const nearCenter = (x: number, y: number) =>
      centers.some(
        ([cx, cy]) =>
          Math.abs(x - (cx ?? 0)) < 1e-6 && Math.abs(y - (cy ?? 0)) < 1e-6,
      );
    // Ring pivots and hub centers share the faces' x/y centers, regardless of depth.
    const rings = cubes.filter(
      (c) => c.rotation && c.pivot && nearCenter(c.pivot[0], c.pivot[1]),
    );
    const hubs = cubes.filter(
      (c) =>
        !c.rotation &&
        !faces.includes(c) &&
        nearCenter(c.origin[0] + c.size[0] / 2, c.origin[1] + c.size[1] / 2),
    );
    expect(rings).toHaveLength(36);
    expect(hubs).toHaveLength(3);
    for (const cube of [...textured, ...rings, ...hubs]) {
      const nearestZ = Math.min(...turnedCorners(body, cube).map((p) => p[2]));
      expect(nearestZ, JSON.stringify(cube)).toBeGreaterThan(rearFace);
    }
  });

  it("keeps spinning road tires clear of flares, steps and bumpers", () => {
    const bounds = (points: number[][]) =>
      [0, 1, 2].map((axis) => {
        const values = points.map((p) => p[axis] as number);
        return [Math.min(...values), Math.max(...values)] as const;
      });
    const obstacles = [...bones.values()]
      .filter((b) => b.name === "body" || b.name.startsWith("door_"))
      .flatMap((b) => (b.cubes ?? []).map((c) => turnedCorners(b, c)))
      .map((corners) => ({ corners, box: bounds(corners) }));
    const apart = (
      a: ReturnType<typeof bounds>,
      b: ReturnType<typeof bounds>,
    ) =>
      a.some(([min, max], axis) => {
        const [lo, hi] = b[axis] as readonly [number, number];
        return max <= lo || hi <= min;
      });
    const wheels = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"].map(
      (name) => {
        const wheel = bones.get(name) as Bone;
        const hub = pivot(name);
        const tires = (wheel.cubes ?? []).map((cube) =>
          turnedCorners(wheel, cube),
        );
        const points = tires.flat();
        const radius = Math.max(
          ...points.map((p) => Math.hypot(p[1] - hub[1], p[2] - hub[2])),
        );
        const sweep = bounds(points);
        sweep[1] = [hub[1] - radius, hub[1] + radius];
        sweep[2] = [hub[2] - radius, hub[2] + radius];
        return {
          name,
          hub,
          tires,
          obstacles: obstacles.filter(({ box }) => !apart(sweep, box)),
        };
      },
    );
    const checkAngle = (angle: number) => {
      const radians = (angle * Math.PI) / 180;
      for (const { name, hub, tires, obstacles } of wheels) {
        for (const corners of tires) {
          const tire = spun(corners, hub, radians);
          const tireBox = bounds(tire);
          for (const { corners: obstacle, box } of obstacles) {
            if (!apart(tireBox, box))
              expect(
                separated(tire, obstacle),
                `${name} at ${angle} degrees`,
              ).toBe(true);
          }
        }
      }
    };
    // Sparse random doubles often cluster near zero and miss short tread-corner collisions.
    for (let angle = 0; angle < 360; angle++) checkAngle(angle);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), checkAngle),
      { numRuns: 12 },
    );
  });

  // The spike's spare cut into the rear window glass, the tailgate and the rear bumper (ADR 0214).
  it("keeps the spare wheel clear of every other body cube and of the rear glass", () => {
    const body = bones.get("body");
    if (!body) throw new Error("Missing SUV body");
    const radius = scaled(dimensions.D) / 2;
    const centerY = scaled(dimensions.SPARE_Y);
    const isSpare = (corners: Vec3[]) =>
      corners.every(
        ([x, y]) => Math.hypot(x, y - centerY) <= radius * 1.03 + 1e-6,
      ) &&
      corners.every(
        ([, , z]) =>
          z >= -scaled(dimensions.SPARE_Z) - scaled(dimensions.D) * 0.22,
      );
    const boxOf = (corners: Vec3[]) =>
      [0, 1, 2].map(
        (axis) =>
          [
            Math.min(...corners.map((p) => p[axis] as number)),
            Math.max(...corners.map((p) => p[axis] as number)),
          ] as const,
      );
    const cubes = (body.cubes ?? []).map((c) => {
      const corners = turnedCorners(body, c);
      return { corners, box: boxOf(corners) };
    });
    const spare = cubes.filter((c) => isSpare(c.corners));
    expect(spare).toHaveLength(133);
    const glass = bones.get("rear_glass");
    const others = [
      ...cubes.filter((c) => !isSpare(c.corners)),
      ...(glass?.cubes ?? []).map((c) => {
        const corners = turnedCorners(glass as Bone, c);
        return { corners, box: boxOf(corners) };
      }),
    ];
    for (const a of spare)
      for (const b of others) {
        const apart = a.box.some(
          ([min, max], axis) =>
            max <= (b.box[axis]?.[0] ?? 0) + 1e-9 ||
            (b.box[axis]?.[1] ?? 0) <= min + 1e-9,
        );
        if (!apart) expect(separated(a.corners, b.corners)).toBe(true);
      }
  });

  it("puts the fuel door on the vehicle's left only (ADR 0225)", () => {
    const body = bones.get("body");
    if (!body) throw new Error("Missing SUV body");
    const unit = scaled(dimensions.D);
    const bars = (body.cubes ?? []).filter((cube) => {
      const [x, y] = cube.origin;
      const centerY = y + cube.size[1] / 2;
      const centerZ = cube.origin[2] + cube.size[2] / 2;
      const doorZ = 3.39 * unit - scaled(dimensions.FRONT_AXLE_Z);
      return (
        cube.size[0] < 0.03 * unit &&
        Math.abs(Math.abs(x) - 0.886 * unit) < 0.03 * unit &&
        Math.abs(centerY - 1.3 * unit) < 0.03 * unit &&
        Math.abs(centerZ - doorZ) < 0.03 * unit
      );
    });
    expect(bars).toHaveLength(36);
    expect(bars.every((cube) => cube.origin[0] > 0)).toBe(true);
  });

  it("allows compound rotations only in declared assemblies (ADR 0167)", () => {
    const cubes = [...bones.values()].flatMap((bone) => bone.cubes ?? []);
    // The steering wheel's 30 arc cubes (ADR 0167) and the hood's 4 shoulder strips (ADR 0214).
    const assemblies = { arc: cubes.filter(multipleAxes) };
    expect(assemblies.arc).toHaveLength(34);
    expect(() => assertOneAxis(cubes, assemblies)).not.toThrow();
  });

  it("has the geometry identifier", () => {
    expect(geometry.description.identifier).toBe("geometry.yasu_ride.suv");
  });

  it("has all the conventional bones", () => {
    for (const name of [
      "root",
      "body",
      "wheel_fl",
      "wheel_fr",
      "wheel_rl",
      "wheel_rr",
      ...DOOR_BY_SEAT,
      "seat_0",
      "seat_1",
      "seat_2",
      "seat_3",
      "rear_glass",
      "windows_sealed",
      "prop_rl",
      "prop_rr",
    ]) {
      expect(bones.has(name), name).toBe(true);
    }
  });

  // The body is nearly symmetric front to back, so its extent cannot tell the
  // front from the rear; the named bones can.
  it("faces -z: front wheels, front doors and front seats sit at lower z than the rear ones", () => {
    for (const side of ["l", "r"]) {
      expect(pivot(`wheel_f${side}`)[2]).toBeLessThan(
        pivot(`wheel_r${side}`)[2],
      );
      expect(pivot(`door_f${side}`)[2]).toBeLessThan(pivot(`door_r${side}`)[2]);
    }
    expect(pivot("seat_0")[2]).toBeLessThan(pivot("seat_2")[2]);
    expect(pivot("seat_1")[2]).toBeLessThan(pivot("seat_3")[2]);
  });

  // SUV_PROFILE.seats.positions uses x = left, and so does the model once it faces -z.
  it("puts each seat, its door and the same-side wheels on the side SUV_PROFILE.seats.positions names", () => {
    for (const [i, seat] of SUV_PROFILE.seats.positions.entries()) {
      const side = Math.sign(seat.x);
      const door = DOOR_BY_SEAT[i] ?? "";
      const letter = door.at(-1);
      expect(Math.sign(pivot(`seat_${i}`)[0]), `seat_${i}`).toBe(side);
      expect(Math.sign(pivot(door)[0]), door).toBe(side);
      for (const w of [`wheel_f${letter}`, `wheel_r${letter}`])
        expect(Math.sign(pivot(w)[0]), w).toBe(side);
    }
  });

  it("has the exhaust locator on body", () => {
    expect(bones.get("body")?.locators?.exhaust).toHaveLength(3);
  });

  it("has an open/close animation for each door", () => {
    for (const d of DOOR_BY_SEAT)
      expect(anims[`animation.yasu_ride.suv.${d}`].bones[d]).toBeDefined();
  });

  // A positive y rotation turns +z toward +x, as seen in game: +70 on the right
  // doors (geometry x < 0, panel toward +z) swung them into the cabin.
  it("swings each door outward from the body", () => {
    for (const d of DOOR_BY_SEAT) {
      const keys = Object.values<Vec3>(
        anims[`animation.yasu_ride.suv.${d}`].bones[d].rotation,
      );
      const openY = keys.reduce(
        (a, k) => (Math.abs(k[1]) > Math.abs(a) ? k[1] : a),
        0,
      );
      const [hingeX, , hingeZ] = pivot(d);
      const cube = bones.get(d)?.cubes?.[0];
      if (!cube) throw new Error(`${d} has no cube`);
      const panelZ = cube.origin[2] + cube.size[2] / 2 - hingeZ;
      const swungX = panelZ * Math.sin((openY * Math.PI) / 180);
      expect(Math.sign(swungX), d).toBe(Math.sign(hingeX));
    }
  });

  // The folded wheels hang FOLD_OUT px out from their axles, and the glow
  // stays under them.
  it("has a glow bone with a hover locator under each folded wheel (ADR 0022)", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const wheel = pivot(`wheel_${w}`);
      const glow = pivot(`glow_${w}`);
      expect(glow[0], `glow_${w} x`).toBe(
        wheel[0] + FOLD_OUT * Math.sign(wheel[0]),
      );
      expect(glow[2], `glow_${w} z`).toBe(wheel[2]);
      expect(bones.get(`glow_${w}`)?.locators).toEqual({
        [`hover_${w}`]: [glow[0], scaled(-0.5), glow[2]],
      });
    }
  });

  it("keeps every hover glow round and inside the vehicle footprint", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const bone = bones.get(`glow_${w}`);
      if (!bone) throw new Error(`Missing glow_${w}`);
      const center = pivot(bone.name);
      const cubes = bone.cubes ?? [];
      const radius = scaled(5);
      expect(cubes).toHaveLength(16);
      for (const cube of cubes) {
        expect(cube.pivot).toEqual(center);
        expect(cube.origin[1]).toBe(scaled(-0.5));
        expect(cube.size[1]).toBe(scaled(0.5));
        expect(cube.rotation?.[0]).toBe(0);
        expect(cube.rotation?.[2]).toBe(0);
        for (const point of turnedCorners(bone, cube)) {
          expect(Math.hypot(point[0], point[2]) / 16).toBeLessThanOrEqual(
            SUV_SPEC.footprint,
          );
          expect(
            Math.hypot(point[0] - center[0], point[2] - center[2]),
          ).toBeCloseTo(radius, 10);
        }
      }
      // A union's boundary includes valleys between tips; corner radii alone
      // would also accept the original square. Intersect rays with every slab.
      for (let degree = 0; degree < 360; degree += 0.25) {
        const reaches = cubes.map((cube) => {
          const angle = ((degree - (cube.rotation?.[1] ?? 0)) * Math.PI) / 180;
          return Math.min(
            cube.size[0] / 2 / Math.abs(Math.cos(angle)),
            cube.size[2] / 2 / Math.abs(Math.sin(angle)),
          );
        });
        const reach = Math.max(...reaches);
        expect(reach).toBeGreaterThanOrEqual(radius * 0.95);
        expect(reach).toBeLessThanOrEqual(radius + 1e-10);
      }
    }
  });

  // Each arm is the axle carried straight out along x, from the axle beam's
  // end at the tyre's inner face to the hub on top of the folded wheel, at
  // axle height (ADR 0218).
  it("extends one straight shaft from each axle beam end to the folded hub", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const wheel = pivot(`wheel_${w}`);
      const out = Math.sign(wheel[0]);
      const arm = bones.get(`arm_${w}`);
      expect(arm?.parent).toBe("root");
      expect(arm?.pivot).toEqual([
        out * scaled(dimensions.ARM_ROOT_X),
        scaled(dimensions.ARM_ROOT_Y),
        wheel[2],
      ]);
      expect(arm?.cubes).toHaveLength(1);
      const c = arm?.cubes?.[0];
      if (!c) throw new Error(`Missing shaft ${w}`);
      expect(c.rotation).toBeUndefined();
      const xs = [c.origin[0], c.origin[0] + c.size[0]].map((x) => x * out);
      expect(Math.min(...xs)).toBeCloseTo(
        scaled(dimensions.ARM_ROOT_X - 0.2),
        10,
      );
      expect(Math.max(...xs)).toBeCloseTo(Math.abs(wheel[0]) + FOLD_OUT, 10);
      for (const axis of [1, 2] as const) {
        expect(c.origin[axis] + c.size[axis] / 2).toBeCloseTo(wheel[axis], 10);
        expect(c.size[axis]).toBeCloseTo(scaled(dimensions.ARM_THICK), 10);
      }
      expect(c.origin[1]).toBeCloseTo(
        scaled(dimensions.FOLDED_WHEEL_TOP_Y),
        10,
      );
    }
  });

  // The render controller shows the bone by name in flight, and it must roll
  // with the body to hide the upright riders (ADR 0026). The front is -z.
  it("has the rear glass as a child of body at the rear", () => {
    const glass = bones.get("rear_glass");
    expect(glass?.parent).toBe("body");
    const cube = glass?.cubes?.[0];
    if (!cube) throw new Error("rear_glass has no cube");
    expect(cube.origin[2]).toBeGreaterThan(20);
  });

  // The window openings have no glass of their own (ADR 0026), so the plates
  // fill them: the windshield plate leans with the windshield frame, and the side
  // plates are thin, sit in the window frames, and overlap no body cube.
  describe("windows_sealed", () => {
    const sealed = bones.get("windows_sealed");
    const plates = sealed?.cubes ?? [];
    const sidePlates = plates.filter((c) => !c.rotation);
    const allBodyCubes = bones.get("body")?.cubes ?? [];
    const bodyCubes = allBodyCubes.filter((c) => !c.rotation);
    const doorCubes = DOOR_BY_SEAT.flatMap((d) => bones.get(d)?.cubes ?? []);
    const frame = [...bodyCubes, ...doorCubes.filter((c) => !c.rotation)];
    const EPS = 1e-6;
    const span = (c: Cube, a: number): [number, number] => [
      c.origin[a] ?? 0,
      (c.origin[a] ?? 0) + (c.size[a] ?? 0),
    ];
    const thinAxis = (c: Cube) => c.size.indexOf(Math.min(...c.size));

    it("is a child of body with the pivot of rear_glass", () => {
      expect(sealed?.parent).toBe("body");
      expect(sealed?.pivot).toEqual(pivot("rear_glass"));
    });

    it("has one windshield plate, leaning with the windshield frame", () => {
      const leaning = plates.filter((c) => c.rotation);
      expect(leaning).toHaveLength(1);
      const [windshield] = leaning;
      // In game a negative x rotation leans the top back toward +z, the cabin
      expect(windshield?.rotation?.[0]).toBeLessThan(0);
      expect(Math.abs(windshield?.rotation?.[0] ?? 0)).toBeCloseTo(
        dimensions.WINDSHIELD_LEAN,
        6,
      );
      const frame = allBodyCubes.filter(
        (c) => c.rotation?.[0] === windshield?.rotation?.[0],
      );
      // Four bars make the frame, which the plate fills.
      expect(frame).toHaveLength(4);
      const sideBars = frame.filter((c) => c.size[1] > c.size[0]);
      const barX = sideBars.flatMap((c) => span(c, 0));
      expect(Math.min(...barX)).toBeLessThanOrEqual(
        (windshield?.origin[0] ?? 0) + EPS,
      );
      expect(Math.max(...barX)).toBeGreaterThanOrEqual(
        (windshield?.origin[0] ?? 0) + (windshield?.size[0] ?? 0) - EPS,
      );
    });

    it("keeps the dashboard fittings and steering clear of the sealed windshield", () => {
      const windshield = plates.find((c) => c.rotation);
      const body = bones.get("body");
      if (!windshield || !sealed || !body) throw new Error("Missing cabin");
      const glass = turnedCorners(sealed, windshield);
      const fittings = (body.cubes ?? [])
        .filter(isPaintedInterior)
        .map((c) => turnedCorners(body, c))
        .filter((corners) =>
          corners.every(
            ([x, y, z]) =>
              Math.abs(x) < scaled(12) &&
              y >= scaled(13) &&
              y <= scaled(22) &&
              z > -scaled(8) &&
              z < 0,
          ),
        );
      expect(fittings.length).toBeGreaterThan(20);
      for (const fitting of fittings)
        expect(separated(glass, fitting)).toBe(true);
    });

    it("keeps all three floor levers clear of the dashboard", () => {
      const body = bones.get("body");
      if (!body) throw new Error("Missing cabin");
      const levers = (body.cubes ?? []).filter(
        (c) =>
          c.pivot?.[1] === scaled(dimensions.FLOOR_Y) &&
          Math.abs(c.pivot[0]) <= scaled(1.1) &&
          c.pivot[2] >= -scaled(7.5 + dimensions.INTERIOR_SHIFT_Z) &&
          c.pivot[2] <= -scaled(6.5 + dimensions.INTERIOR_SHIFT_Z) &&
          c.rotation?.[1] === 0 &&
          c.rotation[2] === 0 &&
          (c.rotation[0] === -15 || c.rotation[0] === -22),
      );
      // Include the slab and fittings, from the grab handle to the cowl edge.
      const dash = (body.cubes ?? [])
        .filter(isPaintedInterior)
        .map((c) => turnedCorners(body, c))
        .filter((corners) =>
          corners.every(
            ([x, y, z]) =>
              Math.abs(x) <= scaled(12) &&
              y >= scaled(13) &&
              y <= scaled(19) &&
              z >= -scaled(dimensions.HOOD_REAR_Z) - 1e-8 &&
              z <= -scaled(dimensions.DASH_FACE_Z - 0.8) + 1e-8,
          ),
        );
      expect(levers).toHaveLength(12);
      expect(dash.length).toBeGreaterThan(0);
      for (const lever of levers)
        for (const fitting of dash)
          expect(separated(turnedCorners(body, lever), fitting)).toBe(true);
    });

    it("keeps the whole steering wheel ahead of the seated driver's torso", () => {
      const body = bones.get("body");
      const driver = SUV_PROFILE.seats.positions[0];
      if (!body || !driver) throw new Error("Missing cabin");
      const steering = (body.cubes ?? []).filter(
        (c) => c.rotation && c.pivot?.[1] === scaled(16.5),
      );
      expect(steering.length).toBeGreaterThan(16);
      // A player's torso is 4 px deep around the rider's position; the model's front is -z.
      const torsoFront = -driver.z * 16 - 2;
      for (const cube of steering)
        for (const [, , z] of turnedCorners(body, cube))
          expect(z).toBeLessThan(torsoFront);
    });

    it("covers the window above each door", () => {
      for (const d of DOOR_BY_SEAT) {
        const panel = bones.get(d)?.cubes?.[0];
        if (!panel) throw new Error(`${d} has no cube`);
        const [z0, z1] = span(panel, 2);
        const side = Math.sign(pivot(d)[0]);
        const covered = sidePlates.some(
          (p) =>
            Math.sign(p.origin[0]) === side &&
            z0 <= p.origin[2] &&
            p.origin[2] + p.size[2] <= z1,
        );
        expect(covered, d).toBe(true);
      }
    });

    it("has thin side plates that overlap no body cube", () => {
      for (const p of sidePlates) {
        expect(Math.min(...p.size)).toBeLessThanOrEqual(scaled(0.1));
        for (const c of bodyCubes) {
          const overlaps = [0, 1, 2].every((a) => {
            const [p0, p1] = span(p, a);
            const [c0, c1] = span(c, a);
            return p0 < c1 && c0 < p1;
          });
          expect(overlaps, JSON.stringify(c)).toBe(false);
        }
      }
    });

    // Each side plate sits at most 0.05 construction px inside the outer face of a frame
    // piece it touches, so it reads as glass set in the window frame.
    it("sits in the window frame, at its outer face", () => {
      for (const p of sidePlates) {
        const thin = thinAxis(p);
        const [p0, p1] = span(p, thin);
        const outer = Math.max(Math.abs(p0), Math.abs(p1));
        const flush = frame.some((c) => {
          const touches = [0, 1, 2].every((a) => {
            const [c0, c1] = span(c, a);
            const [q0, q1] = span(p, a);
            return q0 <= c1 + EPS && c0 <= q1 + EPS;
          });
          const [c0, c1] = span(c, thin);
          const gap = Math.max(Math.abs(c0), Math.abs(c1)) - outer;
          return touches && gap > -EPS && gap <= scaled(0.05) + EPS;
        });
        expect(flush, JSON.stringify(p)).toBe(true);
      }
    });

    // The plates of one window run from its frame's rear edge to its front
    // edge and from the sill to the top rail, so the opening has no gap.
    it("fills each side window from sill to top rail", () => {
      for (const sign of [-1, 1]) {
        const side = sidePlates.filter((p) => Math.sign(p.origin[0]) === sign);
        expect(side.length).toBeGreaterThan(3);
        const ys = side.flatMap((p) => span(p, 1));
        expect(Math.min(...ys)).toBeCloseTo(
          scaled(dimensions.WINDOW_BOTTOM_Y + 0.009 * dimensions.D),
          2,
        );
        expect(Math.max(...ys)).toBeCloseTo(
          scaled(dimensions.WINDOW_TOP_Y - 0.009 * dimensions.D),
          2,
        );
        // The raked front window is built from stacked strips.
        const rows = [...new Set(side.map((p) => p.origin[2] + p.size[2]))];
        expect(rows.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe.each(["rl", "rr"])("prop_%s", (side) => {
    const prop = bones.get(`prop_${side}`);
    const wheel = bones.get(`wheel_${side}`);
    // The first tread block is unrotated, so its inner face gives the inner
    // radius of the tire.
    const tread = wheel?.cubes?.[0];
    const innerRadius = (tread?.origin[1] ?? 0) - pivot(`wheel_${side}`)[1];

    it("is a child of root on the axle of its wheel", () => {
      expect(prop?.parent).toBe("root");
      expect(prop?.pivot).toEqual(pivot(`wheel_${side}`));
    });

    // A ship propeller (ADR 0042): four scimitar blades, each built from
    // segments that turn further around the axle toward the tip, so the blade
    // sweeps back. Blade segments sit wholly on one side of the axle before
    // they are turned; the hub cubes are centered on it.
    it("has four blades 90 degrees apart, each swept further toward the tip", () => {
      const [, py] = pivot(`prop_${side}`);
      const reach = (c: Cube) => c.origin[1] + c.size[1] - py;
      const blades = (prop?.cubes ?? []).filter((c) => c.origin[1] > py);
      // Sweeps stay under 45 degrees, so the nearest multiple of 90 is the
      // blade a segment belongs to. gen_model.py turns the model 180 degrees
      // about y before writing it, which negates rotations about x, so only
      // the sweep's size has to grow toward the tip; its sign is pinned to be
      // the same on both props below.
      const angle = (c: Cube) => c.rotation?.[0] ?? 0;
      const nearestRightAngle = (c: Cube) => Math.round(angle(c) / 90);
      const quadrants = new Map<number, Cube[]>();
      for (const c of blades) {
        const q = ((nearestRightAngle(c) % 4) + 4) % 4;
        quadrants.set(q, [...(quadrants.get(q) ?? []), c]);
      }
      expect([...quadrants.keys()].sort()).toEqual([0, 1, 2, 3]);
      const sweeps = [...quadrants.values()].map((segments) =>
        segments
          .sort((a, b) => reach(a) - reach(b))
          .map((c) => angle(c) - nearestRightAngle(c) * 90),
      );
      for (const s of sweeps) {
        expect(s, JSON.stringify(s)).toEqual(sweeps[0]);
        expect(s.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < s.length; i++) {
          expect(Math.abs(s[i] ?? 0), JSON.stringify(s)).toBeGreaterThan(
            Math.abs(s[i - 1] ?? 0),
          );
          expect(Math.sign(s[i] ?? 0) * Math.sign(s.at(-1) ?? 0)).toBe(1);
        }
      }
    });

    it("sweeps its blades the same way as the other prop", () => {
      const other = bones.get(side === "rl" ? "prop_rr" : "prop_rl");
      const angles = (cubes: Cube[] | undefined) =>
        (cubes ?? []).map((c) => c.rotation?.[0] ?? 0).sort((a, b) => a - b);
      expect(angles(prop?.cubes)).toEqual(angles(other?.cubes));
    });

    it("turns its blades only around the axle", () => {
      for (const c of prop?.cubes ?? []) {
        if (!c.rotation) continue;
        expect(c.rotation[1], JSON.stringify(c)).toBe(0);
        expect(c.rotation[2], JSON.stringify(c)).toBe(0);
      }
    });

    it("lies flat in the wheel's plane: every cube is thinnest along x", () => {
      for (const c of prop?.cubes ?? []) {
        const [sx, sy, sz] = c.size;
        expect(sx, JSON.stringify(c)).toBeLessThan(Math.min(sy, sz));
      }
    });

    // The hub cap is the outermost part of the wheel, so the prop starts where
    // the wheel ends and grows outward from there.
    it("is mounted on the outer face of the hub cap", () => {
      const outward = Math.sign(pivot(`wheel_${side}`)[0]);
      const outerX = (c: Cube) =>
        [c.origin[0], c.origin[0] + c.size[0]].map((x) => x * outward);
      const hubFace = Math.max(...(wheel?.cubes ?? []).flatMap(outerX));
      const propXs = (prop?.cubes ?? []).flatMap(outerX);
      expect(Math.min(...propXs)).toBeCloseTo(hubFace, 6);
    });

    // A rotation around x about the axle keeps every corner's distance from it,
    // so the unrotated corners are enough.
    it("fits inside the tire's inner radius in the wheel's plane", () => {
      expect(innerRadius).toBeGreaterThan(0);
      const [, py, pz] = pivot(`prop_${side}`);
      for (const c of prop?.cubes ?? []) {
        if (c.rotation) expect(c.pivot).toEqual(prop?.pivot);
        for (const y of [c.origin[1], c.origin[1] + c.size[1]])
          for (const z of [c.origin[2], c.origin[2] + c.size[2]])
            expect(Math.hypot(y - py, z - pz)).toBeLessThan(innerRadius);
      }
    });
  });
});
