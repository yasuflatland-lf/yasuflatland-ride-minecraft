# 0145. Move the camper's side lamp and door handle

- Status: Proposed
- Date: 2026-10-25
- Extends: [0067](0067-camper.md)

## Context

The owner asks to move the mid-body amber lamp to the rear and to put the door handle directly under the stripe. The owner also wants the step removed where the side stripe meets the top of the W's outer arms, so the outline follows each arm's inner edge in one diagonal from the stripe's top edge down to the foot. The only mid-body amber part is the right-side porch-light box. The actual front turn signals stay where they are.

## Decision

- Remove the porch-light box. Add static amber rear turn signals at x = +/-22.9 and y = 15.0 px, with chrome bezels of radius 0.9 px and amber lenses of radius 0.65 px. Move them onto the existing rear profile with the tail lights. Keep them in `body`, outside the red tail lights and clear of the ladder, within the existing envelope.
- Move both entry-door handles to y = 28.0..29.0 px, leaving a 0.5 px gap below the stripe at y = 29.5. Preserve their x and z extents and `door_entry` hinge.
- End the side stripe on the W's outer arms' inner edge lines, extended up through the stripe, on both sides of the vehicle: open the stripe wider between the arms and fill the gap with quarter-pixel rows inside that line. The W's size, position, thickness, feet, middle peak, and symmetry stay as they are. Preserve the palette, item icon, bones, locators, front lights, visible bounds, and placement clearance. Bump the Resource Pack to 0.1.126 and regenerate the model and previews.

## Consequences

The rear lamps are static, not emissive, not switched, and do not blink. Adding working turn signals would need a separate decision. Manual rows C161 to C163 check appearance and door movement on PC and mobile; output tests check the geometry and material contracts.
