import { BULLDOZER_PROFILE } from "../../domain/vehicle/kinds/bulldozer/profile";
import { seatWorldPositions } from "../../domain/vehicle/seats";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { seatExitSpot } from "../../infrastructure/vehicle/bedrock/seatExitSpot";
import { type Arena, wait, withCar } from "../arena";
import type { Outcome } from "../outcome";

export async function bulldozerExitSpot(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  const clear = () => dim.runCommand(`fill 88 ${gy} 78 98 ${gy + 5} 88 air`);
  const exit = BULLDOZER_PROFILE.seatExits?.[0];
  if (!exit) return { pass: false, detail: "driver exit missing" };
  const results: Outcome[] = [];
  try {
    clear();
    dim.runCommand(`fill 88 ${gy - 1} 78 98 ${gy - 1} 88 stone`);
    for (const yaw of [0, 90, 180, -90]) {
      results.push(
        await withCar(
          a,
          93.5,
          83.5,
          yaw,
          async (car) => {
            await wait(2);
            const location = car.location;
            const [at] = seatWorldPositions(
              { ...location, yaw: car.getRotation().y },
              [exit],
            );
            if (!at) return { pass: false, detail: `yaw=${yaw} exit missing` };
            const f = car.getViewDirection();
            const dx = at.x - location.x;
            const dz = at.z - location.z;
            const left = dx * f.z - dz * f.x;
            const forward = dx * f.x + dz * f.z;
            const feet = {
              x: Math.floor(at.x),
              y: Math.floor(at.y),
              z: Math.floor(at.z),
            };
            const [feetBlock, headBlock, belowBlock] = [0, 1, -1].map(
              (dy) => dim.getBlock({ ...feet, y: feet.y + dy })?.typeId,
            );
            return {
              pass:
                left >= 1.45 &&
                forward >= -1.1 &&
                forward <= -0.3 &&
                feetBlock === "minecraft:air" &&
                headBlock === "minecraft:air" &&
                belowBlock === "minecraft:stone",
              detail: `yaw=${yaw} left=${left.toFixed(3)} forward=${forward.toFixed(3)} feet=${feetBlock} head=${headBlock} below=${belowBlock}`,
            };
          },
          ENTITY_TYPE.bulldozer,
        ),
      );
    }
    return {
      pass: results.every((result) => result.pass),
      detail: results.map((result) => result.detail).join("; "),
    };
  } finally {
    clear();
  }
}

/**
 * Runs the seat exit's ground check on real blocks, so the block ids and the snow
 * layer's height state it reads are the engine's (ADR 0141).
 */
export async function bulldozerExitGround(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  const clear = () => dim.runCommand(`fill 88 ${gy} 78 98 ${gy + 5} 88 air`);
  const cases: {
    name: string;
    x: number;
    blocks: [number, string][];
    dy?: number;
    stands?: number;
  }[] = [
    { name: "stone", x: 88, blocks: [], stands: 0 },
    {
      name: "short_grass",
      x: 89,
      blocks: [
        [-1, "dirt"],
        [0, "short_grass"],
      ],
      stands: 0,
    },
    {
      name: "snow3",
      x: 90,
      blocks: [[0, 'snow_layer ["height"=3]']],
      stands: 0,
    },
    { name: "snow7", x: 91, blocks: [[0, 'snow_layer ["height"=7]']] },
    {
      name: "grass_path",
      x: 92,
      blocks: [[-1, "grass_path"]],
      dy: -1 / 16,
      stands: 1 / 16,
    },
    { name: "ledge", x: 93, blocks: [[-1, "air"]] },
    { name: "water", x: 94, blocks: [[-1, "water"]] },
  ];
  try {
    clear();
    dim.runCommand(`fill 88 ${gy - 1} 78 98 ${gy - 1} 88 stone`);
    for (const { x, blocks } of cases)
      for (const [dy, block] of blocks)
        dim.runCommand(`setblock ${x} ${gy + dy} 83 ${block}`);
    await wait(2);
    const results = cases.map(({ name, x, dy = 0, stands }) => {
      const at = { x: x + 0.5, y: gy + dy, z: 83.5 };
      const spot = seatExitSpot(dim, at);
      const pass =
        stands === undefined
          ? spot === undefined
          : spot !== undefined && Math.abs(spot.y - (at.y + stands)) < 1e-6;
      return { pass, detail: `${name}=${spot?.y ?? "engine"}` };
    });
    return {
      pass: results.every((result) => result.pass),
      detail: results.map((result) => result.detail).join("; "),
    };
  } finally {
    clear();
    dim.runCommand(`fill 88 ${gy - 1} 78 98 ${gy - 1} 88 stone`);
  }
}
