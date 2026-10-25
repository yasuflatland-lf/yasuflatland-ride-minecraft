# 0148. Smooth the bulldozer side bevel

- Status: Proposed
- Date: 2026-10-25
- Extends: 0136, 0138

## Context

The six stacked rows on the rear side covers and the gussets beside the radiator visibly form stairs. The owner requests one tilted panel instead.

## Decision

Replace the six rows on each side with one yellow cube, 0.4 px thick, rotated about z. Its exposed face joins the existing outer edge at y 29.5 to the inner edge at y 32.5, spanning 4 px horizontally. Start at z 15.075, where the front diagonal reaches the bevel's outer edge, and end at z 37.1. A narrow horizontal shelf joins the upper edge to the cab. Mirror the panel and shelf to the other side through the existing generator. Regenerate the geometry and previews and bump the Resource Pack to 0.1.132.

Replace each 26-row front gusset with one 0.4 px thick yellow plate, spanning x 7.5 to 9.5 and running from (z, y) (-19.5, 9.5) to (-13.9, 22.2). Put the thickness behind the original front face. Mirror it to the other side and keep both plates in `blade_rig`, so they follow the existing blade animation (0138). Retain the rod flanges and push arms.

Close the front of each side cover with a 0.4 px thick planar skin following the door diagonal, from (z, y) (13.2, 24.5) toward (16.2, 32.5). Preserve its trapezoidal outline where it meets the upper bevel. Since a Bedrock cube cannot be trapezoidal, use 50 adjacent 0.1 px wide strips on the same plane, with their upper ends tucked into the upper skin. Recess the old stepped backing so it cannot break through the face. The result is one continuous planar surface rather than a staircase.

## Consequences

The bevel has a continuous flat surface. The front closure meets the upper bevel without the previous opening. Bones, paint swatches, and collision behavior are unchanged. Keep this decision Proposed until the owner checks the panel and door clearance in game.
