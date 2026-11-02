# 0201. Build Wand cylinder and cube

- Status: Accepted
- Date: 2026-11-01
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): the shape menu and the roof height step

## Context

The Build Wand of 0198 offers Fill, Frame, and two roofs on a horizontal rectangle, and Fill, Faces only, and Walls only on a box. Players also want round towers and plain solid blocks. The roof flow already has the steps a vertical solid needs: aim at a height, preview live, tap to confirm, and fall back to a slider. Copying that flow for each new solid would duplicate the aim, slider, preview, and confirm code, so the height step is generalised first, keyed by a height-step kind, and the solids are added on top as definitions.

## Decision

Behavior:

1. The shape menu after the end points offers Cylinder and Cube on a horizontal rectangle (Fill, Frame, Gable roof, Hip roof, Cylinder, Cube, Cancel) and Cylinder on a box (Fill, Faces only, Walls only, Cylinder, Cancel). Cube is not offered on a box because Fill, Faces only, and Walls only already produce the same three results.
2. On a horizontal rectangle, Cylinder and Cube start the same height step as a roof: aim at the height, live preview, tap to confirm, and an optional slider fallback. The solid grows upward from the rectangle. On a box, Cylinder skips the height step and the box's own height is the cylinder's height.
3. A contents menu follows: Fill (every block), Hollow (a one-block shell with top and bottom closed), Tube (the side wall only, top and bottom open), and Cancel, which returns to end-point selection (0198). Roofs keep Fill and Hollow only.
4. The cylinder fits exactly inside the bounding box of the points and stands upright; a non-square box gives an ellipse. The cube fills the bounding box.
5. A solid is built from the selected material with the same edit job, 100,000-block limit, Undo, confirmed box (Copy), and feedback as roofs. The height cap for Cylinder and Cube is the world top only (`BUILD_SPEC.worldTopY`), not the 300 percent rule of roofs; the 100,000-block limit is checked on confirm and reports the existing "too large" feedback.
6. Not offered: solids on a vertical rectangle or a line, sideways or oblique cylinders, downward growth, wall thickness other than one block, and spheres, pyramids, or cones.

Cylinder geometry:

7. For a footprint of width `w` (x) and depth `d` (z), the centre is `cx = (minX + maxX) / 2` and `cz = (minZ + maxZ) / 2`. A column `(x, z)` is inside when `((x - cx) / (w / 2))^2 + ((z - cz) / (d / 2))^2 <= 1`. A column is wall when it is inside and at least one of its four horizontal neighbours is not inside; a column outside the footprint is never inside.
8. For layer `l` of `h`: Fill is the inside columns; Hollow is the inside columns on the bottom and top layers and the wall columns on the others; Tube is the wall columns on every layer. This leaves no hole in a Hollow or Tube wall by construction. The elliptic test is a standard one; no code is copied from other projects.

Structure:

9. A new domain folder `src/domain/build/volume/` holds `HeightedKind` (roof kinds plus `cylinder` and `cube`), `FillStyle` (`fill`, `hollow`, `tube`), and a `HeightedGeometry` registry (cells, count, maximum height, and preview wireframe per kind). The roof flow state `roofHeight` becomes `heightStep` with `heightedKind` and `heightLocked`, and the roof use cases and menu are renamed to match. The refactors land before the solids and change no behavior.

## Consequences

- A new solid is a registry entry, not a branch in the height step, the preview, or the edit job.
- A cube is offered only where it adds a result, which keeps the box menu short.
- The cylinder rule is a pure function of the footprint, so property-based tests (0010) can check it for leaks, symmetry, and the cell count.
- Large solids reach the 100,000-block limit quickly; the player sees the existing "too large" message on confirm rather than a lower height cap.
- Revisit this decision if players ask for a thicker wall, a sphere, or a sideways cylinder.
