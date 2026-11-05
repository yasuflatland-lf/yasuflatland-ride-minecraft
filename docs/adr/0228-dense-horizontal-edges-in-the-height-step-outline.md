# 0228. Dense horizontal edges in the height-step outline

- Status: Proposed
- Acceptance condition: the owner aims a roof, a Cube, a Cylinder, and a Copy height on a client and finds the height easier to read than with the one-particle-per-block outline
- Date: 2026-11-06
- Related: [0198](0198-one-build-wand-without-a-bulldozer.md): the height step and its wireframe
- Related: [0201](0201-build-wand-cylinder-and-cube.md): the Cylinder and Cube height step

## Context

While aiming a roof or a solid height with the view ray, the outline is a wireframe of particles, one per block along each edge. The owner finds the height hard to place by eye: the only marks on the outline are a dotted top edge and a dotted vertical edge, so it is hard to see whether the top sits on the target layer.

## Decision

- In the height-step outline, sample the horizontal curves at the top and bottom of the shape four times per block (`BUILD_SPEC.denseOutlinePerBlock`), so the top reads as a continuous ring. Every other curve stays at one particle per block. The curves are the box's top and bottom edges for Cube and Copy, the two ellipses for Cylinder, and the eaves and the ridge for roofs. The vertical edges and the roof hips stay sparse.
- Keep the 512-particle budget (`outlineMaxPoints`). When the dense curves alone exceed it, they share the whole budget in proportion to their length and the sparse curves get nothing; otherwise the sparse curves share what is left.
- Leave the outline of the start and end points as it is.

## Consequences

A large footprint draws fewer vertical particles, and may draw none, so the vertical extent is carried only by the two rings. A roof or box at one layer has its top and bottom curves coincide. Revisit if the owner finds the rings too heavy on mobile or wants the layers between marked.
