// In-game checks of the tent entity contract (ADR 0130).
import { ItemStack } from "@minecraft/server";
import {
  TENT_FAMILY,
  TENT_FLAP_PROPERTY,
  TENT_ITEM,
  TENT_LANTERN_PROPERTY,
  TENT_TYPE,
} from "../../infrastructure/camp/identifiers";
import { type Arena, type Outcome, wait } from "../arena";

export async function tentEntityContract(a: Arena): Promise<Outcome> {
  const at = { x: 119.5, y: a.gy + 2, z: 46.5 };
  a.dim.runCommand(`summon ${TENT_TYPE} ${at.x} ${at.y} ${at.z}`);
  const tent = a.dim.getEntities({
    type: TENT_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!tent) return { pass: false, detail: "tent not spawned" };
  try {
    await wait(10);
    const y = tent.location.y;
    const family = tent.matches({ families: [TENT_FAMILY] });
    const inanimate = tent.matches({ families: ["inanimate"] });
    const flaps = Object.values(TENT_FLAP_PROPERTY).map((p) =>
      tent.getProperty(p),
    );
    const lantern = tent.getProperty(TENT_LANTERN_PROPERTY);
    const variant = tent.getComponent("minecraft:variant")?.value;
    tent.applyDamage(5);
    const health = tent.getComponent("minecraft:health")?.currentValue;
    const item = new ItemStack(TENT_ITEM, 1);
    return {
      pass:
        Math.abs(y - at.y) < 0.01 &&
        family &&
        inanimate &&
        flaps.every((v) => v === 0) &&
        lantern === false &&
        variant === 0 &&
        health === 20 &&
        item.typeId === TENT_ITEM,
      detail: `y=${y} family=${family} inanimate=${inanimate} flaps=${flaps} lantern=${lantern} variant=${variant} health=${health} item=${item.typeId}`,
    };
  } finally {
    if (tent.isValid) tent.remove();
  }
}
