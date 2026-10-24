import { BULLDOZER_PROFILE } from "../../domain/vehicle/kinds/bulldozer/profile";
import { seatWorldPositions } from "../../domain/vehicle/seats";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, type Outcome, wait, withCar } from "../arena";

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
            const dx = at.x - location.x,
              dz = at.z - location.z;
            const left = dx * f.z - dz * f.x;
            const forward = dx * f.x + dz * f.z;
            const feet = {
              x: Math.floor(at.x),
              y: Math.floor(at.y),
              z: Math.floor(at.z),
            };
            const cells = [0, 1, -1].map(
              (dy) => dim.getBlock({ ...feet, y: feet.y + dy })?.typeId,
            );
            return {
              pass:
                left >= 1.45 &&
                forward >= -1.1 &&
                forward <= -0.3 &&
                Math.abs(at.y - location.y) < 0.01 &&
                cells[0] === "minecraft:air" &&
                cells[1] === "minecraft:air" &&
                cells[2] === "minecraft:stone",
              detail: `yaw=${yaw} left=${left.toFixed(3)} forward=${forward.toFixed(3)} feet=${cells[0]} head=${cells[1]} below=${cells[2]}`,
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
