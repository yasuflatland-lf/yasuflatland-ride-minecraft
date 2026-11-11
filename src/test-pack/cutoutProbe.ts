import { type Player, system } from "@minecraft/server";

// Literal ids keep this manual probe independent of feature impact selection.
const PROBE_ID = "yasu_ride_test:cutout_probe";
const DISTANCE = 3;

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== PROBE_ID) return;
  if (event.sourceEntity?.typeId !== "minecraft:player") return;
  const player = event.sourceEntity as Player;
  try {
    const dimension = player.dimension;
    for (const probe of dimension.getEntities({ type: PROBE_ID })) {
      probe.remove();
    }
    const yaw = player.getRotation().y;
    const radians = (yaw * Math.PI) / 180;
    const origin = player.location;
    const probe = dimension.spawnEntity(PROBE_ID, {
      x: origin.x - Math.sin(radians) * DISTANCE,
      y: origin.y,
      z: origin.z + Math.cos(radians) * DISTANCE,
    });
    probe.setRotation({ x: 0, y: yaw + 180 });
    player.sendMessage(
      "[cutout] View against sky, grass, black wool and white wool; from above, the side and below, on PC and mobile (touch). Check for fringes, visible hidden faces and incorrect water alpha order.",
    );
  } catch (error) {
    player.sendMessage(`[cutout] Could not spawn the probe: ${String(error)}`);
  }
});
