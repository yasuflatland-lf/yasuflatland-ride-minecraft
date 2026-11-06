# Build Wand: spheres, sideways cylinders, and terrain clearing and filling

## Intent

The owner wants to build round buildings that are not boxes, shaped as spheres or as cylinders lying on their side. The owner also wants to open up a space such as a cave in one action and then build inside it, and to do the reverse: fill the holes below a chosen area. These operations come from WorldEdit-BE (`sphere`, `cyl`, `removeabove`, `fill`, `fillr`), but only the ideas are taken. WorldEdit-BE is GPL-3.0 and uses beta APIs, so nothing is copied from it (0178).

The owner wants a filling player to end up standing free rather than buried, without running anything by hand.

## Goals

- Sphere and sideways cylinder entries in the Selection Wand's shape menu, fitted to the box the two tapped points select.
- A way to remove everything above a tapped area, up to the top of the world, on an area of about 30 by 30.
- A way to fill the connected hollow below a tapped area, staying inside that area.
- A player whose own feet or head cell gets written by an edit is moved up to free space automatically when the edit ends.
- Everything stays on the wand and its forms, so it works the same on iPad and PC.

## Non-goals

- No chat or custom commands. No radius or depth arguments.
- No flood fill from where the player stands; the area always comes from two tapped points.
- No Undo for the two terrain operations (owner's decision). No Redo.
- No sideways spread beyond the selected area, and no separate column-only fill.
- No sideways cylinder along the vertical axis or at an oblique angle, and no wall thickness other than one block (unchanged from 0201).
- No `removebelow`, `removenear`, `replacenear`, masks, or multi-block patterns.
- No change to the limits of existing edits, Copy, or Cut.

## Anti-goals (failure even if it works)

- A terrain operation runs by accident and destroys terrain with no way back. Each one needs an explicit confirmation.
- The server stalls while scanning or applying a large area. Work must stay within the per-tick budget.
- The completion message promises an Undo that would not revert the operation just run.
- A chest, a vehicle, or a tent is damaged by a terrain operation.
- A player is teleported when they were not buried by the edit, for example while standing in tall grass, in water, or riding a vehicle.

## Decided by the owner

### Sphere

- The player taps two points to select a box, chooses Sphere, and the sphere fits exactly inside that box.

### Sideways cylinder

- The player taps two points to select a box and chooses Sideways cylinder. The cylinder fits that box, and its axis follows the direction the player is looking.

### Remove above

- The player taps two points to select an area, then everything above it is removed up to the top of the world.
- When the points are at different heights, removal starts from the lower point's height.

### Fill below

- There is one fill operation, with `fillr`'s behavior, confined to the selection. The owner first asked for `fill` and `fillr` with a 10-block sideways spread. An adversarial model showed the spread pours out over open ground (3,050 cells outside a 10 by 10 area on a hillside), so the owner chose to stay inside the selection, and then dropped `fill` because the two would barely differ.
- The player taps two points to select an area, then fills downward from it.
- When the points are at different heights, filling starts from the higher point's height.
- Nothing is ever written outside the area's x and z extents or above its top layer.
- A material that falls or needs support (sand, gravel, a torch, a flower) is refused for this operation.
- After filling, the player must not stay buried. This runs automatically.

### Terrain operations

- They have no Undo.
- The owner wants to clear an area of about 30 by 30. The maximum side of 32 below was proposed and not objected to.
- Removing what holds something up is accepted, as with Cut: a vehicle falls, a tent floats, a player falls, and an attached block may pop off. The confirmation form warns that things above can fall.

## The builder's calls so far (the owner can overrule these)

These were proposed in conversation or decided while writing this document.

### Sphere

- A box that is not a cube gives an ellipsoid, matching how the cylinder becomes an elliptic cylinder (0201).
- Offered on a box and on a horizontal rectangle. A horizontal rectangle goes through the existing live height step first, like Cylinder. A box locks its height, like a box Cylinder. Not offered on a line or a vertical rectangle.
- Contents are Fill, Hollow, and Cancel. Tube has no meaning for a sphere.
- A cell is inside when its normalized squared distance from the box center is at most one, in exact integer arithmetic as `cylinder.ts` does. Hollow keeps the inside cells with at least one of the six neighbors outside.
- The existing `BUILD_SPEC.maxVolume` limit on the placed count applies, and Undo works as for other builds.
- `count` must stay cheap on large boxes: per column, not per cell of the bounding box, because a height step's box can be very large.

### Sideways cylinder

- The axis is the dominant horizontal look axis, read once when the entry is chosen, with x winning a tie (the same rule as `virtualEndPoint`). The form is open at that moment, so reading the view direction at the response has to be confirmed on iPad. Pitch is ignored.
- The axis is stored in the height-step flow, so the outline and the placement use it and later look changes do not move it.
- The cross section is the ellipse fitted to the box's height and its width across the axis. It runs the full box length along the axis.
- Contents are Fill, Hollow (closed ends), Tube (open ends), and Cancel, with the same meaning as Cylinder's but along the axis. A Tube works as a tunnel.
- Offered on a box and on a horizontal rectangle (height step first), not on a line or a vertical rectangle. A cross section one block high or wide is allowed and just gives a thin result, as Cylinder allows today.
- The same limit and Undo as other builds apply.
- Share the ellipse logic with `cylinder.ts` by generalizing it over an axis, keeping upright Cylinder behavior unchanged.

### Terrain operations in general

- The entries Remove above and Fill below appear in the shape menu on every shape: line, either kind of rectangle, and box. Uneven cave floors rarely give two points at one height, and the area is taken from the x and z extents of the two points.
- The first tapped block's existing material rule stays. It supplies the fill material and is ignored by Remove above. The first tap is therefore still refused on a chest or other unusable material.
- Selecting an entry opens a confirmation form that names the operation, shows the area's size and the affected height, and says it cannot be undone and that things above can fall. Confirming starts the job. Cancel or dismissing returns to end-point aiming, the same as shape menu Cancel.
- The limit is geometric: each side of the x and z extents may be at most `BUILD_SPEC.maxTerrainSide` (32). Over that reports the existing too-large message and changes nothing. `BUILD_SPEC.maxVolume` does not apply to them.
- They run through `EditJobs` under the shared `BUILD_SPEC.blocksPerTick` budget, one edit per player, with the existing protections: kept types and `mayEdit` skip cells, and nothing is rolled back. At 4,096 per tick, the worst case for Remove above (32 x 32 x 384 = 393,216 planned cells) takes about 5 seconds.
- A job for these operations keeps no per-cell history and adds no history record. It finishes with the count-only `editDoneCount` message. It must not use the Undo-promising message or take the Undo hint, even when the session holds earlier history. Today `promisesUndo` tests only `hasHistory`, so a job needs an explicit "no history" mode instead of the `undo` boolean alone.
- Undo after one of these reverts the previous undoable edit. Cells this operation changed are conflicts, so Undo skips them through the existing rule (0232).
- Protections match Cut: a kept block or a protected cell stays and everything else proceeds. No whole-area refusal.
- Starting one confirms the selected footprint's box for later utility Copy, as starting a build does, and the flow returns to idle.
- Preview: the normal point-1 and end-point outline. No separate outline of the affected column is drawn.

### Remove above

- The lower point's layer stays as the floor; removal starts one layer above it and runs to `BUILD_SPEC.worldTopY`.
- Fluids in range are removed like any block. Outside fluids may flow back, as with Cut.
- Cells above a dimension's real ceiling are unreadable and are skipped at the normal cost.
- Blocks not on the kept lists can be removed, the same as Cut. That includes a Nether roof's bedrock if the list does not protect it.

### Fill below

- Filling starts at the higher point's layer, inclusive, so the result sits level with the higher tapped surface.
- A fillable cell is air or a fluid. Water and lava are replaced because holes in caves often hold them. An unreadable or protected cell, or any other block, is a barrier.
- The search starts from the area's fillable cells on the top layer and spreads through fillable cells to the six neighbors, staying inside the area's x and z extents and at or below the top layer. It goes around an overhang inside the area, and it also goes upward so a pocket above a ledge's opening is filled.
- A hollow that does not connect to a fillable top-layer cell is not filled.
- The search reads each cell at most once and keeps its visited marks in a typed array sized to the prism (at most 32 x 32 x 384). It cannot grow past that, so it never stops part way.
- The plan reads the world while it runs, so it is a lazy plan given a read function, and each read and each write consumes budget. The domain stays pure. The worst case is about 10 seconds at the current budget.
- Known and accepted: selecting across a slope fills up to the higher point and leaves a cliff at the area's edge. A mistaken high tap makes a large block, so the confirmation form shows the top layer's height as well as the size. A player in a side passage outside the area can be walled in by air and has to dig out; they are not moved because their cell was not written.

### Automatic unstuck

- It runs after any edit by that player, including builds, paste, and undo, not only fills, but only when the job itself wrote that player's feet or head cell. This is the guard against moving a player who stands in tall grass: the stable API has `isAir` and `isLiquid` but no `isSolid` in the installed 2.11 types.
- Each tick a job runs, read the player's cell once and compare written cells against it, setting a flag on the job.
- When the job ends, if the flag is set and the feet or head cell is neither air nor liquid, search up the same column for the first cell with two free cells (air) and teleport the player to its center.
- Only the player who started the edit is moved. A player riding a vehicle is not moved. Nothing is moved if the player left or changed dimension.
- The player can be inside a block for the seconds the job still runs, so suffocation damage in Survival is possible for a moment. This is accepted.

## Constraints

- Stable Script API only (0001). Domain code is pure; engine calls stay in `src/infrastructure/build/bedrock/` behind ports (0012, 0046).
- Tuning values live in `BUILD_SPEC` (`src/domain/build/spec.ts`).
- New forms and messages need `en_US.lang` and `ja_JP.lang` keys. The Resource Pack manifest version goes up (0015).
- Properties for pure geometry and plans (fast-check), and in-game scenarios with `CATALOG` entries for real permutations and teleporting (0010).
- This decision reverses parts of accepted ADRs, so a new ADR is needed: 0201 Decision 6 excludes spheres and sideways cylinders, and 0198 Decision 11 sets the edit limit that the terrain operations replace with a geometric one. `docs/specs/build-tools.md` is updated in the same pull request, and new `docs/manual-test.md` rows cover the iPad axis reading and the teleport feel.

## Left to the builder

- Internal naming of entries, spec constants, and job modes.
- How to split the work into pull requests. Sphere and sideways cylinder extend the existing `volume` registry; terrain operations and automatic unstuck are new job behavior and can land separately.
- The placement of new menu entries, keeping Cut, Copy, and Cancel last in their existing order, and the English and Japanese wording.
