import { type Player, system } from "@minecraft/server";

// Literal ids keep the probe independent of feature imports in impact.ts.
const LOUNGE_PROBE = {
  event: "yasu_ride_test:lounge",
  searchRadius: 4,
  animation: "animation.yasu_ride.player.lounge",
  controller: "yasu_ride.lounge",
} as const;

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== LOUNGE_PROBE.event) return;
  if (event.sourceEntity?.typeId !== "minecraft:player") return;
  const player = event.sourceEntity as Player;
  try {
    if (!player.getComponent("minecraft:riding")) {
      const origin = player.location;
      const nearby = player.dimension.getEntities({
        location: origin,
        maxDistance: LOUNGE_PROBE.searchRadius,
      });
      const distanceSquared = (location: typeof origin) =>
        (location.x - origin.x) ** 2 +
        (location.y - origin.y) ** 2 +
        (location.z - origin.z) ** 2;
      nearby.sort(
        (a, b) => distanceSquared(a.location) - distanceSquared(b.location),
      );
      const rideable = nearby
        .filter((entity) => entity.id !== player.id)
        .map((entity) => entity.getComponent("minecraft:rideable"))
        .find((component) => component !== undefined);
      if (!rideable) {
        player.sendMessage(
          `[lounge] No rideable entity within ${LOUNGE_PROBE.searchRadius} blocks.`,
        );
        return;
      }
      if (!rideable.addRider(player)) {
        player.sendMessage(
          "[lounge] Could not mount the nearest rideable entity.",
        );
        return;
      }
    }
    player.playAnimation(LOUNGE_PROBE.animation, {
      stopExpression: "!query.is_riding",
      controller: LOUNGE_PROBE.controller,
    });
    player.sendMessage("[lounge] Playing lounge pose. Dismount to stop.");
  } catch (error) {
    player.sendMessage(
      `[lounge] Could not mount or play the pose: ${String(error)}`,
    );
  }
});
