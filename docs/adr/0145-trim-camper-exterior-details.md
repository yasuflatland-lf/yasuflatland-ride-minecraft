# 0145. Trim camper exterior details

- Status: Proposed
- Date: 2026-10-25
- Extends: [0067](0067-camper.md)

## Context

The owner asks for three exterior fixes: shave the side W's protruding corners, move the mid-body amber lamp to the rear, and put the door handle directly under the stripe. The W already fits its ideal outline; its six convex tips are the corners to trim. The only mid-body amber part is the right-side porch-light box. The actual front turn signals stay where they are.

## Decision

- Trim the four foot tips and two peak tips on each side with 45-degree chamfers whose leg is `W_TIP_CUT = 0.8` px. Keep four single-cube rotated strokes per side, shortening their foot and inner peak ends. Fill the ends with unrotated rows no taller than `W_ROW = 0.25` px, contained in the ideal outline. Keep the W's size, position over the front wheel, symmetry, 0.12 px thickness, and stripe swatch.
- Remove the porch-light box. Add static amber rear turn signals at x = +/-22.9 and y = 15.0 px, with chrome bezels of radius 0.9 px and amber lenses of radius 0.65 px. Move them onto the existing rear profile with the tail lights. Keep them in `body`, outside the red tail lights and clear of the ladder, within the existing envelope.
- Move both entry-door handles to y = 28.0..29.0 px, leaving a 0.5 px gap below the stripe at y = 29.5. Preserve their x and z extents and `door_entry` hinge.
- Preserve the palette, item icon, bones, locators, front lights, visible bounds, and placement clearance. Bump the Resource Pack to 0.1.126 and regenerate the model and previews.

## Consequences

The W exception in 0067 still stands. Quarter-pixel rows approximate the chamfers while the long stroke edges stay straight. The rear lamps are static, not emissive, not switched, and do not blink. Adding working turn signals would need a separate decision. Manual rows C161 to C163 check appearance and door movement on PC and mobile; output tests check the geometry and material contracts.
