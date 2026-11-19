# 0201. Build Wand cylinder and cube

- Status: Accepted
- Date: 2026-11-01
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): the shape menu and the roof height step

## Context

The Build Wand of 0198 offers Fill, Frame, and two roofs on a horizontal rectangle, and Fill, Faces only, and Walls only on a box. Players also want round towers and plain solid blocks. The live selection already fixes the height before the player chooses a shape. Solids can use that height, while roofs need to set their own height from the lowest layer.

## Decision

Behavior:

1. Offer Cylinder and Cube on horizontal rectangles and boxes, after the basic placement styles. The shared group is ordered Gable roof, Hip roof, Cylinder, Sideways cylinder, Sphere and Cube.
2. After the live selection height is confirmed (ADR 0253), Cylinder and Cube open the contents menu directly at the selected height, including one layer on a horizontal rectangle. Gable and hip roofs on either selection start their own unlocked height step from the lowest selection layer.
3. A contents menu follows: Fill (every block), Hollow (a one-block shell with top and bottom closed), Tube (the side wall only, top and bottom open), and Cancel, which returns to end-point selection (0198). Roofs keep Fill and Hollow only.
4. The upright Cylinder uses an ellipse fitted to the footprint of the selected box. The ellipse can leave an end column empty on a narrow footprint. Cube Fill uses every cell of the selected box.
5. Solids and roofs use the selected material and the shared edit job, protections, 100,000-block placed-count limit and Undo. A successful build leaves the smallest box containing the shape’s Fill cells selected at the root menu and available for Copy. The edit records the full pre-build selection for Undo.
6. Offer solids only on boxes and horizontal rectangles. [0233](0233-round-shapes-and-terrain-operations.md) adds sideways cylinders and spheres to the original solid choices. Oblique cylinders, downward growth, adjustable wall thickness, pyramids and cones are outside this decision.

Cylinder geometry:

7. For a footprint of width `w` (x) and depth `d` (z), the centre is `cx = (minX + maxX) / 2` and `cz = (minZ + maxZ) / 2`. A column `(x, z)` is inside when `((x - cx) / (w / 2))^2 + ((z - cz) / (d / 2))^2 <= 1`. A column is wall when it is inside and at least one of its four horizontal neighbours is not inside; a column outside the footprint is never inside.
8. For layer `l` of `h`: Fill is the inside columns; Hollow is the inside columns on the bottom and top layers and the wall columns on the others; Tube is the wall columns on every layer. This leaves no hole in a Hollow or Tube wall by construction. The elliptic test is a standard one; no code is copied from other projects.

Structure:

9. The domain folder `src/domain/build/volume/` defines the height-step kinds and fill styles and registers the height limits, wireframes, cell iterators and placement counts. The same Fill geometry supplies the selected bounds. The internal `heightStep` flow carries the fixed height for solids and the adjustable height for roofs.

## Consequences

- A new solid is a registry entry, not a branch in the height step, the preview, or the edit job.
- Cube remains available across both selection shapes and keeps the result selected for a follow-up edit.
- The cylinder rule is a pure function of the footprint, so property-based tests (0010) can check it for leaks, symmetry, and the cell count.
- Large solids reach the 100,000-block limit quickly; the player sees the existing "too large" message on confirm when the chosen contents exceed that limit.
- Revisit this decision if players ask for thicker walls or more shapes.
