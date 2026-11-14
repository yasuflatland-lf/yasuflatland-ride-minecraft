# 0227. Camper door trim, a thin-panel step, and a storage hatch

- Status: Proposed
- Acceptance condition: the owner compares the door, the step, and the storage hatch with the reference photos on a client
- Date: 2026-11-05
- Related: [0067](0067-camper.md): the door and the fold-out step this model refines
- Related: [0145](0145-move-camper-side-lamp-and-door-handle.md): the handle position stays
- Related: [0015](0015-dev-server-docker-nethernet.md): the Resource Pack version bump in 0226 covers this model change

## Context

The owner asked for the door's aluminium surround and handle to match a close-up photo, for the fold-out step, a solid-looking black block, to become thin panels like a dustpan, and for the rear corner's plain louvred box to match a close-up of the storage hatch. On the photo the step's back is open: the background shows between the tread and the body, with a thin rod across it.

The photo's door is taller for its width than the model's: 16.8 photo px per model px across, and 19.4 up. The model's door stops at y = 12, while the photo's reaches the threshold.

## Decision

- Build the entry inside with four recessed wood fields, an opaque window backing, metal reveal and perimeter, a marble band, scuffed kick plate, escutcheon and deadbolt, and two tied mini curtains with 160 rotated pleats. All 212 added cubes fit the original slab envelope (final x -24 to -23, y 12 to 54, z -6.9 to 6.9), preserving the swing clearance. Thin the outer skin to 0.2 px while keeping its outward face and UVs fixed; both existing handles and the glass pane stay unchanged. The opaque entry bone totals 244 cubes.
- Register `door wood` (111 by 336, WOOD), `door marble` (101 by 41, STONE), `door kick` (101 by 44, METAL), and `door cloth` (16 by 104, FABRIC) before packing the atlas. Wood fields use eight texels per model pixel and vertical grain. The shower panel shares this wood region on all six faces; its two handles remain chrome. Regenerate the colour, lit and mirror companion maps with the packed layout.

- Add a fixed surround to the `body` bone, so it stays when the door swings. The latch side has one strip, and the hinge side two with a dark seam. A riveted threshold plate sits at y = 9.2 to 10.7, an inner head rail over the door, and a riveted two-step drip cap past both jambs. Three hinges at y = 13.3, 32.1, and 51.5 each have a bright leaf and two dark knuckle ends, and a small catch sits low on the latch side.
- Each strip uses `aluminium`, with a narrow `chrome` edge and `grille` seams for contrast. The strips' lips cover the gap around the door, which hid a white hairline.
- Keep the threshold at the wall's bottom with the tan skin above it, not directly under the door, because the door is shorter than on the photo.
- Add an aluminium latch plate to the `door_entry` bone, 2.35 by 2.7 px at the rear edge, with a dark recess and four rivets. The handle cubes stay where 0145 put them.
- Round the door window's inner corners with 1 px level rows inside the existing square frame.
- Replace the step with thin black panels, open at the back: a 0.3 px tread with a short front lip and four dark grip lines, two 0.3 px side plates that narrow going up and slant 0.2 px toward the rear per px of height, and a thin rod under the body.

- Rebuild the storage hatch on both walls at z = 42.6 to 55.4, y = 8.2 to 24: an aluminium rail with rounded top corners and six rivets, a panel with 22 louver rows crossed by four dividers to read as five columns, eight screws, a dark label at the top centre, three latch knobs on the rear rail, and the seam and rivet row of the wall panel above. Each row spans all the columns; separate louvers per column would add over 200 cubes per side for the same look.

## Consequences

The surround and the hatches add about 270 cubes, before the 212-cube interior addition, and the owner should watch frame rates on mobile. The strips are at most 0.5 px proud, so they do not affect collision. The atlas now includes four procedural interior finishes. The exterior aluminium still uses colour contrast; both interior and exterior appearance need the owner's client check. The photo's black and silver pinstripe along the skirt's top is not modelled.
