# Beach Chair: design

Date: 2026-11-09. Status: draft for the owner's approval. Revised for the owner's "option C" decision on the table form (a low table that hosts only lanterns and ovens), and again for the owner's decision to make the bed one full block wide and rescale the chair to the photo proportions (1 by 3 cells).

## Intent

The owner wants a Beach Chair as the second item in the Resort Gear group, next to the Beach Parasol ([2026-11-09-beach-parasol-design.md](2026-11-09-beach-parasol-design.md)). The scene they have in mind: two chairs side by side under a parasol, with players lying on their backs on them together, and a third chair folded into a low table beside them, holding a lantern or a Dutch oven.

One item, two forms. A tap switches the chair into a table and back. The folded table is a resort item in its own right, not the Camp Table from Camping Gear (Outside).

The owner supplied reference photos of a slatted teak sun lounger. They are product photos, so they stay out of the repository; the builder reads them from the owner's machine at `~/Downloads/`:

- `beach_chair_img.png`: the lounger in use, from the foot end, with the backrest raised and its steel prop visible.
- `beach_chair_from_front_left.png`: from the front left.
- `beach_chair_from_left.png`: from the left on a white background. The clearest view of the parts.
- `beach_chair_from_right_front.png`: from the right front.
- `beach_chair_folded.png`: the folded form, a low slatted table.

The model must match these photos closely. That is the main quality bar.

## Goals

1. `yasu_ride:beach_chair_item` in the Resort Gear group, right after the Beach Parasol. Lang: en_US "Beach Chair"; ja_JP uses the Japanese word for "beach chair".
2. A Beach Chair entity whose chair form reproduces the photos (see Model).
3. In the chair form, a player can lie on their back on it, in their own skin: legs straight along the bed and the upper body reclined along the raised backrest (the owner chose this "A" pose over lying fully flat).
4. A tap on the chair opens a two-choice menu: lie down, or fold into a table. A tap on the table turns it back into a chair with no menu.
5. In the table form, Gas Lanterns and Dutch Ovens can stand on top. Ordinary blocks cannot be placed on it.
6. Three hits take the chair back as an item.
7. Survival players can craft it.

## Non-goals

- No paint. The chair keeps the wood colors of the photo.
- No adjustable backrest angle. The chair form has one fixed recline.
- No starter item on first join. Only the parasol is given (my call).
- No sitting, lying, or standing on the table form, and no ordinary blocks on it.
- Folding does not shrink the footprint. The real lounger slides into half its length; the owner chose to keep the footprint of both forms the same ("B" in the mockup), now 3 blocks long.

## Anti-goals

- A chair that looks like a generic deck chair. It must read as the photographed lounger: long slatted bed, slats running lengthwise, the lighter interlocking band where the foot frame meets the main frame, the slatted backrest with its top crossbar, the square legs with foot pads, and the deep side rails.
- A player who "lies down" but is shown sitting upright, or is hidden behind a stand-in figure. The owner chose the real player model, in their own skin, lying on their back.
- Things on the table left floating or lost when the form changes. The table refuses to turn back into a chair while anything is on it.
- Invisible helper blocks in the world. The chair lays none in either form (owner decision, "option C").

## Size and forms

One block is 1 m (16 px). The entity occupies 1 by 3 cells in both forms: 1 wide, 3 long along the player's facing direction at placement, snapped to a quarter turn. The entity origin is at ground level at the center of the middle cell. Model -z is the foot end and +z the head end.

- **Chair form.** The bed is one full block wide, 16 px (x from -8 to 8), and about 46 px long (z from -23 to 23), centered on the entity origin. The length follows the photos: their length to width ratio is about 2.86 to 1, and 16 px times 2.86 is about 46 px. The outline leaves a 1 px margin at each end of the 48 px footprint (z from -1.4375 to 1.4375 blocks). The other dimensions are the earlier 12 px wide model scaled by 16/12:
  - **Bed height.** The bed top is 9 px (`TOP_PX`, round(7 x 16/12)). The photos put the seat height at about 0.18 to 0.2 of the length, 8.3 to 9.2 px on 46 px, so 9 fits both the scale factor and the photos.
  - **Lengthwise layout.** Foot-end stub z [-23, -15], the lighter interlocking band z [-15, -11.5], main bed z [-11.5, 9.5] (21 px), main rails z [-11.5, 14.5], and rear frame z [14.5, 23]. Stub, main bed, and rear frame are about 0.25, 0.56, and 0.19 of the length, as in the photos.
  - **Backrest.** Hinged at [0, 9, 9.5] px, raised about 37 degrees, 13.5 px long, so it would end at z 23 if laid flat. One shallow prop per side, at about 26.8 degrees and 9.34 px long.
  - **Sections.** Legs 1.55 px square with foot pads, rails 0.55 px thick. The main apron spans y [7.2, 9]; the stub and rear aprons span y [7.2, 8.76]. 13 slats across the bed, each 0.7 px wide with 0.48 px gaps.
  - The backrest, its prop, and the rear frame stay within the 3-cell footprint.
- **Table form.** A low slatted table like `beach_chair_folded.png`, with its top at 9 px, the same height as the chair bed top (underside at 8.76 px). The top is 16 px wide (x from -8 to 8) and as long as the chair's main bed, 21 px (z from -10.5 to 10.5), centered on the entity origin so the hosting math needs no center offset. Four corner legs of the same 1.55 px section as the chair legs, up to y 6.63 px, under a 2.13 px apron. The top shows the row of small square holes across its middle, where the two slat sets interlock. The entity keeps its 1 by 3 footprint for placement and refusal rules; the chair bed outline stays x [-8, 8], z [-23, 23] px.
- **Hit boxes.** The entity's collision box is 1.0 by 0.5625 blocks. Its `custom_hit_test` has three boxes, each 1.0 wide and 1.125 high, with pivots [0, 0.5625, z] for z = -0.9375, 0, and 0.9375 blocks. Together they cover the whole 16 by 46 px footprint in both forms, since one box cannot be longer than the engine allows.
- **Switching.** A short animation lowers or raises the backrest (my call). The entity, its position, and its footprint stay the same.

## Model

Generated by a new `tools/gen_beach_chair.py` (front at model -z, ADR 0009), with geometry, texture atlas, and item preview produced by `pnpm model`, like the other gear. Use panels (`tools/panels.py`, `tools/cube_tilt.py`) for the tilted backrest slats and any other angled parts.

Parts, from the photos:

- **Main frame**: deep side rails and a foot-end rail, equal thin square legs with foot pads, and a flush junction with the foot-end stub. Warm teak.
- **Bed slats**: many narrow slats running lengthwise with gaps between them. Near the foot end, a band where the foot frame's slats and the main frame's slats interlock, slightly lighter in tone.
- **Backrest**: lengthwise slats on a tilted frame with a crossbar at the top, hinged where it meets the bed. A thin steel prop holds it up from behind.
- **Rear frame**: a short frame with its own legs behind the backrest pivot, carrying the prop.
- **Table form**: the low 16 by 21 px table described under Size and forms, keeping its model shape. The builder decides whether it is one geometry with animated bones or separate bones toggled by the form.

Colors are sampled from the photos (warm unweathered teak, as in `beach_chair_from_left.png`; the steel prop light grey).

**Fidelity check.** Before wiring behavior, the builder renders previews (`tools/render_preview.py`) from the same viewpoints as the photos, plus the folded form against `beach_chair_folded.png`, and shows them to the owner side by side with the photos. The owner approves the look, then the rest proceeds. Expect a round or two of adjustments.

## Placement

- Using the item on the top face of a block places a chair, in the chair form, across three cells. The pressed cell is the foot cell; the next two cells away from the player along their facing direction, snapped to a quarter turn, are the middle cell and the head cell. The backrest is at the head end, the far end (my call: the player stands at the foot and looks down the chair). In entity-local blocks, the foot cell spans z [-1.5, -0.5], the middle cell [-0.5, 0.5], and the head cell [0.5, 1.5]; the entity spawns at the center of the middle cell.
- All three cells need a solid top face below and clear air above (two layers, so a lying player fits), and all three must be outside vehicle space and tent camp space. Otherwise placement is refused with an action-bar message, and nothing is consumed.
- Survival consumes the item; Creative does not. The same per-player, per-tick dedupe and deferred placement as other gear apply.

## Chair form: lying down

- A tap on the chair (PC right-click, touch interact or long press) opens a form with two choices: "Lie down" and "Fold into a table". It uses the shared per-player exclusive form guard, as the roof tent menu does.
- "Lie down" seats the player on a one-player rideable seat on the bed. One player per chair. A second player gets an action-bar message.
- "Fold into a table" is refused with a message while someone is lying on the chair (my call).
- Getting up uses the normal dismount (sneak on PC, the dismount button on touch). The player is placed beside the chair.
- **The lying pose.** The stable Script API cannot set a player's pose. The owner chose to override the vanilla player client entity definition in the Resource Pack (`player.entity.json`) to add a lying animation, played from the script with `Entity.playAnimation` (stable, already used for vehicles) while the player rides a Beach Chair, and stopped when they get off. No beta API and no experimental toggle are involved, so this stays within ADR 0001.
  - This reverses the earlier judgment recorded for the roof tent (`docs/specs/camping-gear.md`, roof tent entry: "overriding that definition is fragile"). A new ADR records the decision and its two known risks: another add-on that also overrides `player.entity.json` will conflict, and a Mojang update to the vanilla player definition requires updating the override.
  - **Spike first.** Before the model and behavior work, the builder confirms on the dev BDS that the override plus `playAnimation` puts a riding player in the reclined pose (legs along the bed, upper body along the backrest) on PC and on mobile, in first and third person, and that other players see it. If it fails, stop and bring the result to the owner; do not fall back to another approach without their decision.
  - Players who join or come into range while someone is lying must see the pose too, so the script re-sends the animation on a short interval while the player stays seated, as the roof tent refreshes its concealment (my call). After a reload or restart, a player still seated on a chair gets the pose again from the restore scan.
  - The override must keep every vanilla player animation and render behavior intact. Only the lying animation is added.
  - The roof tent keeps its current invisibility and sleeping-bag approach. Changing it is out of scope.

## Table form

Owner decision ("option C"): the folded table is a low table, its top at the same height as the chair bed top (9 px), that hosts only Gas Lanterns and Dutch Ovens. This reverses the earlier decision to raise the table top to 16 px (a full block, a "tall stool") so that ordinary blocks could be placed on it through invisible laid blocks. That earlier approach, its invisible `yasu_ride:beach_chair_top` block, its block-placement forwarding, its use of the laid block layer, and its `top_cells` property are dropped.

- Taps and hits on the table land on the chair entity itself, through its hit box, as in the chair form. Nothing is forwarded from blocks.
- A tap on the table:
  - holding a Gas Lantern or Dutch Oven item: host it on the top (below);
  - empty hand or any other item: turn the table back into a chair, with no menu, unless a lantern or oven stands on it. Then it is refused with an action-bar message.
- No seat. A tap never seats a player in the table form.
- Ordinary blocks cannot be placed on the table.
- **Lanterns and ovens.** Gas Lantern and Dutch Oven items used on the table stand on its top, through the shared tabletop host registry, with the same aim, fit, overlap, clearance, and payment rules as the Camp Table tabletop (ADR 0185, ADR 0191). The top is a `TopSurface` like the Camp Table's: `TopSurface { half: { halfX: 8, halfZ: 10.5 }, topPx: 9, limit: 4, clearanceBase: 0 }`. The limit comes from the footprints (`DUTCH_OVEN_FOOTPRINT_PX` 11.5 by 10 px, `GAS_LANTERN_FOOTPRINT_PX` 7.5 by 6.5 px) on the 16 by 21 px top: two ovens fit end to end (20 <= 21 along z), or one oven and two lanterns, or up to six lanterns in a 2 by 3 grid (15 <= 16, 19.5 <= 21). `placeOnTop`'s overlap check refuses anything that does not fit, and a limit of 4 caps the lanterns as on the Camp Table. Presses on hosted items keep working (lantern switch, oven lid).
- **"Something on the table"** means a hosted lantern or oven, and nothing else.

## Taking it back

- Three non-dye hits within the shared hit window take the chair back in either form. Hits land on the chair entity in both forms, returning one `beach_chair_item` to the hitter, with hint messages before the last hit as other gear does.
- Refused, with a message and the counter left alone, while someone is lying on it or a lantern or oven stands on the table (my call, following the Camp Table rule that it is not taken back while it holds an oven).

## Getting one

- A shaped crafting-table recipe from planks, sticks, and iron ingots (for the steel prop). The exact pattern is the builder's choice; it must not collide with a vanilla or existing add-on recipe.

## Code placement

- The chair lives in the `resort` feature created by the parasol work, so **the parasol work lands first**. The Resort Gear group, the `resort` feature folders, `installResort`, and the shared placement and take-back machinery come from it.
- Hosting lanterns and ovens is camp machinery today, and features cannot import each other (ADR 0046). Before any chair code, a refactor with no behavior change, in its own commit or pull request, moves the tabletop host abstraction (`domain/camp/tabletop.ts`, `application/camp/placeOnTableTop.ts`, its port, the hosted-items guard, and the hosted marker codec, to confirm while planning) into `shared/`, so a resort entity can be a host. Camp keeps its behavior and its tests stay green.
- The form, the rideable seat, and the dismount handling follow the roof tent occupant code, generalized into `shared/` only as far as two users need.
- Tuning values go in one place, a `BEACH_CHAIR_SPEC` in `src/domain/resort/`: `topPx` 9, `topHalf` `{ halfX: 8, halfZ: 10.5 }` px, `topLimit` 4, `seatOffset` `[0, 0.5625, 0.3125]` blocks (the lying rider's hips, 4.5 px ahead of the backrest hinge; the entity's rideable seat uses the same position), the chair bed outline x [-8, 8], z [-23, 23] px, and the 1 by 3 cell footprint (foot, middle, and head cells).
- The chair lays no blocks: it does not use the laid block layer, registers no table block, and keeps no `top_cells` property.

## Documentation and tests

- A new ADR for the Beach Chair, covering the two forms, the menu, the low table that hosts only lanterns and ovens (and why ordinary blocks and invisible blocks were dropped), and the player definition override with its risks and spike result. Update `docs/specs/resort-gear.md` (created by the parasol work) and `docs/specs/camping-gear.md` where the tabletop rules move to shared. Run `pnpm run docs`.
- Bump the Resource Pack manifest version.
- Property tests for the pure parts: the three footprint cells (foot, middle, head) at all four yaws, placement refusal rules, the form state machine (chair to table refused while occupied, table to chair refused while a lantern or oven is on it, take-back refusals), and the table `TopSurface` (its limit of 4 fits two ovens, or an oven and two lanterns, and at least two items in any mix).
- Pack tests: catalog group order, item, recipe, entity contract (one seat, form property, three hit boxes covering the 16 by 46 px footprint), the player definition override keeps every vanilla animation and adds only the lying one.
- In-game scenarios, each with a `CATALOG` entry: place and take back, fold and unfold, a lantern or oven hosted on the table, refusal while something is on the table. The folded table holds its pose and does not sink (`clearVelocity` and hold at the pose origin).
- Manual checks for the owner: the lying pose on PC and mobile, seen by self and others; the menu on touch.

## Left to the builder

- Small pixel adjustments within the numbers above, and how each tilted part is built from cubes.
- Whether the table form is an animated bone or a separate pose.
- The recipe pattern, message wording (English and Japanese), and sounds (reuse existing camp gear sounds when they fit).

## Summary of my calls (for the owner to check)

1. The backrest is at the far end from the player when placed.
2. (Owner decision) Both forms keep a 1 by 3 footprint, the bed is one full block (16 px) wide and about 46 px long, following the photo's 2.86 to 1 length to width ratio. This replaces the earlier 1 by 2 footprint with a 12 px wide bed.
3. A short backrest animation when switching forms.
4. No starter item, and no paint.
5. "Fold into a table" is refused while someone is lying on the chair.
6. Taking back is refused while someone is lying on it or a lantern or oven is on the table.
7. (Owner decision, "option C") The table is a low table, 16 by 21 px with its top at the bed height (9 px), that hosts only lanterns and ovens, up to 4; no ordinary blocks and no invisible blocks. This replaces the earlier call to support blocks with invisible laid blocks and a 16 px top.
8. The parasol work lands before the chair.
9. On the table: a lantern or oven item hosts, anything else unfolds.
10. Taps and hits on the table go to the chair entity itself, as in the chair form.
11. The lying pose is re-sent on an interval for late viewers and restored after reload.
12. (Dropped with option C: there are no blocks on the table to share it with.)
13. The bed top is 9 px, the rounded 7 x 16/12, which also matches the photos' seat height of about 0.18 to 0.2 of the length.
14. The table is 21/16 = 1.31 long to wide, against about 1.5 in the folded photo, because its length is tied to the main bed. The photo's main apron also looks somewhat deeper relative to the exposed leg (about 0.33 against 0.26 in the model). The owner judges both in the previews.
