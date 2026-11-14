# 0234. Plated camper mirrors and a simpler camper exterior

- Status: Proposed
- Acceptance condition: the owner compares the camper's mirrors, water inlet, front roof edge, and rear hatches with the reference photos on a client, with Vibrant Visuals on and off
- Date: 2026-11-06
- Extends: [0159](0159-a-pbr-rear-view-mirror-on-the-sports-boat.md): the same separate PBR pass, now for the camper's mirrors
- Related: [0227](0227-camper-door-trim-and-thin-panel-step.md): the storage hatch and the water inlet this refines

## Context

The owner compared the camper with photos and asked for four changes. The left rear wall carries a storage hatch that the real vehicle has only on the right. A rail with the amber lamps runs across the front roof edge, but the real roof edge has only the lamps. The west-coast mirrors are chrome swatches with dark slits, where the real ones are polished plate. The water inlet's lamp and its filler ring were built as ovals, but they are round on the vehicle and only look oval in an oblique photo.

## Decision

- Build the storage hatch on the right wall only.
- Remove the aluminium roof lip across the front. The side rails and every amber lamp stay. The bolt region shrinks to the side rails' length.
- Move both mirrors, brackets, rods, housings, and straps into a new `mirror` bone (parent `body`) after `body`, drawn by an always-on `controller.render.yasu_ride.camper.mirror` pass with `camper_mirror.png` and `camper_mirror_mer.png`. The base pass hides the bone. MER is metalness 255, emissive 0, roughness 26 on a new 16 x 32 `mirror_chrome` tile and `(0, 0, 255)` elsewhere. Both companions use the registry layout dimensions; the mask translates the nested tile through the `base` region origin and stays confined to its 16 x 32 texels. The independent base interior texture set changes neither this pass nor its material or visibility. The tile bakes a sky, horizon, and ground gradient with narrow dark streaks, so devices without PBR still show a bright plated look.
- Make the inlet's ring and lamp true circles, add the thin plate above the lamp and a metal cap in the ring, as on the photo.
- Raise the Resource Pack and the Behavior Pack's dependency to 0.1.268 (0015).

## Consequences

Vibrant Visuals reflects the environment on the mirrors. Without it the baked gradient is shown. The camper gains one bone and loses about 100 cubes. The left rear wall and the front roof edge are plain. The preview images show the mirrors by the tile's center texel, as in 0159.
