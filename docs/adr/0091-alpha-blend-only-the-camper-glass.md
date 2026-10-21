# 0091. Alpha-blend only the camper glass

- Status: Accepted
- Date: 2026-10-21
- Extends: 0009, 0067

## Context

The owner reported that from outside a parked camper, the windows show the terrain on the far side of the camper instead of its cabin. The client entity drew the whole camper model with `entity_alphablend`, because the window swatch `glass` (alpha 110) is the only see-through color. That material writes depth, and the game does not sort the cubes of one entity. In `tools/gen_camper.py` the side windows, corner glass, windshield, mirror, and rear window sit early in the `body` cubes, and the door window sits in `door_entry`. The far wall, curtains, furniture, seats, and steering come later. A near pane drawn first fills the depth buffer, so the cabin behind it fails the depth test, and the pane blends over whatever was drawn before the camper: the terrain. This is inferred from how Bedrock renders, not watched frame by frame in game.

Parking only made the bug easy to see, since that is when players walk around the camper and look in. The render controller and animations have no parked condition. The room blocks of 0068 use geometry with no cubes, so they draw nothing and write no depth. The sports boat already draws with `entity` and gives `entity_alphablend` only to its `windshield` bone (0051), and nobody has reported the bug on the boat.

## Decision

- The camper's client entity draws with `entity` by default, `entity` and `entity_emissive` for the unlit and lit lamps as before, and `entity_alphablend` only for the material `glass`
- The generator moves every cube with the `glass` swatch out of the opaque bones into two glass bones, listed after every other bone so they draw last:
  - `glass`: child of `body`, pivot `[0, 0, 0]`, holding the body glass (side windows, corner glass, windshield, mirror glass, rear window)
  - `door_glass`: child of `door_entry`, pivot at the door hinge, holding the door window so it swings with the door
- The cubes keep their own coordinates, rotations, and pivots. The render controller maps both bones to `Material.glass`
- This extends the bone contract of 0009 for the camper with `glass` and `door_glass`. No opaque camper bone may hold a `glass` swatch cube, and every other camper swatch stays fully opaque, which `entity` needs

## Consequences

- Through a window the cabin shows, tinted by the glass. The previews do not change, because `tools/render_preview.py` already picks see-through faces by texel alpha
- The glass panes are still not sorted among themselves. Looking through a near pane at a far pane may lose the far pane's tint or show a small artifact on it. The cabin stays visible, so we accept this. Revisit if players notice it
- A new see-through part of the camper goes into a glass bone, not into an opaque one. `tests/packs/camper.test.ts` checks this
- If a playtest still shows the terrain through the windows, look next at client culling of the parked camper's small collision box, which 0068 sets
