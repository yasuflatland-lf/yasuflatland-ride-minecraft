import { type Player, system } from "@minecraft/server";

const SCOOTER_POSE_PROBE = {
  event: "yasu_ride_test:scooter_pose",
  searchRadius: 4,
  blendOutTime: 0,
  levels: {
    grip: "scooter_grip",
    "0": "scooter_grip",
    l1: "scooter_lean_l1",
    "-1": "scooter_lean_l1",
    l2: "scooter_lean_l2",
    "-2": "scooter_lean_l2",
    l3: "scooter_lean_l3",
    "-3": "scooter_lean_l3",
    l4: "scooter_lean_l4",
    "-4": "scooter_lean_l4",
    l5: "scooter_lean_l5",
    "-5": "scooter_lean_l5",
    r1: "scooter_lean_r1",
    "1": "scooter_lean_r1",
    r2: "scooter_lean_r2",
    "2": "scooter_lean_r2",
    r3: "scooter_lean_r3",
    "3": "scooter_lean_r3",
    r4: "scooter_lean_r4",
    "4": "scooter_lean_r4",
    r5: "scooter_lean_r5",
    "5": "scooter_lean_r5",
    pgrip: "scooter_pillion_grip",
    pl1: "scooter_pillion_lean_l1",
    pl2: "scooter_pillion_lean_l2",
    pl3: "scooter_pillion_lean_l3",
    pl4: "scooter_pillion_lean_l4",
    pl5: "scooter_pillion_lean_l5",
    pr1: "scooter_pillion_lean_r1",
    pr2: "scooter_pillion_lean_r2",
    pr3: "scooter_pillion_lean_r3",
    pr4: "scooter_pillion_lean_r4",
    pr5: "scooter_pillion_lean_r5",
  },
  controller: "yasu_ride.scooter_pose",
} as const;

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== SCOOTER_POSE_PROBE.event) return;
  if (event.sourceEntity?.typeId !== "minecraft:player") return;
  const player = event.sourceEntity as Player;
  const level = event.message.trim();
  if (!Object.hasOwn(SCOOTER_POSE_PROBE.levels, level)) {
    player.sendMessage(
      "[scooter_pose] Driver: grip (0), l1 to l5 (-1 to -5), r1 to r5 (1 to 5). Passenger: pgrip, pl1 to pl5, pr1 to pr5.",
    );
    return;
  }
  const pose =
    SCOOTER_POSE_PROBE.levels[level as keyof typeof SCOOTER_POSE_PROBE.levels];
  try {
    if (!player.getComponent("minecraft:riding")) {
      const origin = player.location;
      const nearby = player.dimension.getEntities({
        location: origin,
        maxDistance: SCOOTER_POSE_PROBE.searchRadius,
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
          `[scooter_pose] No rideable entity within ${SCOOTER_POSE_PROBE.searchRadius} blocks.`,
        );
        return;
      }
      if (!rideable.addRider(player)) {
        player.sendMessage(
          "[scooter_pose] Could not mount the nearest rideable entity.",
        );
        return;
      }
    }
    player.playAnimation(`animation.yasu_ride.player.${pose}`, {
      blendOutTime: SCOOTER_POSE_PROBE.blendOutTime,
      stopExpression: "!query.is_riding",
      controller: SCOOTER_POSE_PROBE.controller,
    });
    player.sendMessage(`[scooter_pose] Playing ${pose}. Dismount to stop.`);
  } catch (error) {
    player.sendMessage(
      `[scooter_pose] Could not mount or play the pose: ${String(error)}`,
    );
  }
});
