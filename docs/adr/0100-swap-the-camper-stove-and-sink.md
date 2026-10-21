# 0100. Swap the camper stove and sink

- Status: Accepted (stove decor standing on the bare plate in the middle of the cooktop is superseded by [0105](0107-stand-stove-gear-on-a-burner.md): it stands on a burner)
- Date: 2026-10-21
- Supersedes in part: 0093 (the stove and counter cells)

## Context

0093 put the stove in local cell (-1, -1, 1), right behind the door, and the counter with the sink in (-1, -2, 1) behind it. The stove was drafted without a reference: one flat steel plate with four flat black squares for burners, a plain black oven door, and four chrome knobs on the wood body.

For the v0.12.0 play test (#393, #407) the owner supplied a photo of the real 1970s motorhome's range. Seen from the aisle, the sink is on the left of the range, toward the front of the vehicle, with only a narrow strip of counter between them. The range has a stainless cooktop with a rolled front lip, a vent strip along the back, four large gas burners with black cast-iron grates, a gold woodgrain control panel leaning back with five black knobs, and a brushed silver oven door with a chrome handle bar along its top.

## Decision

- The stove moves to cell (-1, -2, 1) and the counter with the sink to (-1, -1, 1). The `stove` and `counter` slot ids stay, and both slot heights stay 14 px. The wall cabinet above (layer 2) is unchanged
- `tools/gen_camper.py` draws the sink unit in model z 8.5 to 24 and the stove in z 24 to 39.5 (`STOVE_Z`), with the sink's shape unchanged
- The stove follows the photo: a steel plate with a chrome front lip, a far-side flange, a sink-side trim, a rear strip with vent slots on its sink-side half only, and an ivory ledge at the wall; four burners in a 2 x 2 grid, centered on the slot point across the aisle, each a drip bowl, a dark gap, a head with a port band and a top disc, an eight-bar black grate ring, and six raised prongs; a harvest panel with two woodgrain lines leaning back 20 degrees about its lower front edge, five round black knobs with chrome skirts and smaller chrome caps, each part an octagon of two crossed bar pairs grouped toward the far end, and the sink-side third of the panel blank; a chrome strip, a shadow line, a chrome handle bar, and a brushed door in a steel frame below
- No brand badge, lettering, or logo is drawn. The panel area where the photo has a badge stays blank
- Each slot cell's middle stays flat at 30 px and free of rotated cubes, so decor stands on a flat top: the sink stays behind the counter slot point and every burner part stays outside the 7 px square around the stove slot point (the widest item's footprint), so the burners are smaller than in the photo
- Every stove cube stays within x 8.0 to 22.8 (clear of the aisle and the wall) and under y 31.5 (the tallest item on the stove still clears the wall cabinet at y 38)
- This replaces 0093's cells for the stove and the counter, in its furniture table and its slot table. The rest of 0093 stands

## Consequences

- Decor already saved in the `stove` or `counter` slot of a parked camper is redrawn in the slot's new cell the next time the room is laid. Nothing else moves
- The camper model grows by a few hundred cubes, all in the body bone
- The camper model changes, so the Resource Pack version goes up and the dev server needs a restart (0015)
- The counter top keeps its harvest color although the photo's laminate is cream; change it in its own decision if the play test asks for it
