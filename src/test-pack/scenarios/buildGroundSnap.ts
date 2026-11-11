import { boxFromSize } from "../../domain/build/box";
import { snapToGround } from "../../domain/build/clipboard/ground";
import { asDimensionId } from "../../domain/shared/ids";
import { BedrockGroundProbe } from "../../infrastructure/build/bedrock/bedrockGroundProbe";
import type { Arena } from "../arena";
import type { Outcome } from "../outcome";

// Stable APIs cannot synthesize client itemUse, so these exercise the production probe.
async function checkTerrain(
  a: Arena,
  terrain: "slope" | "water" | "cave",
): Promise<Outcome> {
  const probe = new BedrockGroundProbe();
  const dimension = asDimensionId(a.dim.id);
  const box = boxFromSize(a.at(20, a.gy + 4, 20), { x: 3, y: 2, z: 3 });
  const originals = [];
  for (let y = a.gy; y <= a.gy + 6; y++)
    for (let z = 20; z <= 22; z++)
      for (let x = 20; x <= 22; x++) {
        const block = a.dim.getBlock(a.at(x, y, z));
        if (!block)
          return { pass: false, detail: "terrain fixture is unloaded" };
        originals.push({
          cell: block.location,
          permutation: block.permutation,
        });
      }
  try {
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 22, a.gy + 6, 22)} air`);
    for (let x = 20; x <= 22; x++) {
      const top = a.gy + (terrain === "slope" ? x - 20 : 0);
      a.dim.runCommand(`fill ${a.box(x, a.gy, 20, x, top, 22)} stone`);
    }
    if (terrain === "water")
      a.dim.runCommand(
        `fill ${a.box(20, a.gy + 1, 20, 22, a.gy + 3, 22)} water`,
      );
    if (terrain === "cave")
      a.dim.runCommand(
        `fill ${a.box(20, a.gy + 5, 20, 22, a.gy + 5, 22)} stone`,
      );
    const tops = [];
    for (let z = box.min.z; z <= box.max.z; z++)
      for (let x = box.min.x; x <= box.max.x; x++) {
        const top = probe.topSolidY(dimension, x, z, box.min.y);
        const expected = a.gy + (terrain === "slope" ? x - box.min.x : 0);
        if (top !== expected)
          return {
            pass: false,
            detail: `${terrain}: ${x},${z} expected ${expected}, got ${top}`,
          };
        tops.push(top);
      }
    const snapped = snapToGround(box, (x, z) =>
      probe.topSolidY(dimension, x, z, box.min.y),
    );
    return {
      pass: snapped?.min.y === Math.max(...tops) + 1,
      detail: `${terrain}: snapped=${snapped?.min.y}, tops=${tops.join(",")}`,
    };
  } finally {
    for (const { cell, permutation } of originals)
      a.dim.getBlock(cell)?.setPermutation(permutation);
  }
}

export async function buildGroundSnapSlope(a: Arena): Promise<Outcome> {
  return checkTerrain(a, "slope");
}
export async function buildGroundSnapWater(a: Arena): Promise<Outcome> {
  return checkTerrain(a, "water");
}
export async function buildGroundSnapCave(a: Arena): Promise<Outcome> {
  return checkTerrain(a, "cave");
}
