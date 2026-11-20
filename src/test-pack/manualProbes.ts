import { type Player, system } from "@minecraft/server";

const DISTANCE = 3;

function registerProbe(id: string, tag: string, instructions: string): void {
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== id) return;
    if (event.sourceEntity?.typeId !== "minecraft:player") return;
    const player = event.sourceEntity as Player;
    try {
      const dimension = player.dimension;
      for (const probe of dimension.getEntities({ type: id })) {
        probe.remove();
      }
      const yaw = player.getRotation().y;
      const radians = (yaw * Math.PI) / 180;
      const origin = player.location;
      const probe = dimension.spawnEntity(id, {
        x: origin.x - Math.sin(radians) * DISTANCE,
        y: origin.y,
        z: origin.z + Math.cos(radians) * DISTANCE,
      });
      probe.setRotation({ x: 0, y: yaw + 180 });
      player.sendMessage(`[${tag}] ${instructions}`);
    } catch (error) {
      player.sendMessage(
        `[${tag}] Could not spawn the probe: ${String(error)}`,
      );
    }
  });
}

// Literal ids keep these manual probes independent of feature impact selection.
registerProbe(
  "yasu_ride_test:cutout_probe",
  "cutout",
  "View against sky, grass, black wool and white wool; from above, the side and below, on PC and mobile (touch). Check for fringes, visible hidden faces and incorrect water alpha order.",
);
registerProbe(
  "yasu_ride_test:rotation_probe",
  "rotation",
  "On PC and mobile (touch), compare each red compound cube with the adjacent blue reference: their shapes and angles must coincide.",
);
