# 0151. Enclose the bulldozer blade supports

- Status: Proposed
- Date: 2026-10-26
- Extends: 0136, 0138, 0148

## Context

The open space below each blade lift actuator shows through from the side. The owner wants a triangular side panel like the reference dozer, with rectangular panels closing its rear and underside, on both sides of the vehicle and both sides of each actuator.

## Decision

Keep the existing front slope from `(z, y) = (-19.5, 9.5)` to `(-13.9, 22.2)`. Add a rear corner at `(2.0, 12.0)` and close the triangle with yellow side skins at both x edges of each push arm. Use 0.4 px strips so the sloped outline stays close to straight. Span the arm's 7.5 to 9.5 px width with 0.4 px rectangular plates along the rear and lower edges. Mirror the complete support to the opposite side through `both()`. Keep every panel in `blade_rig` so it follows the blade lift, and bump the Resource Pack to 0.1.134.

## Consequences

Each support reads as an enclosed triangular housing from either side. The panels move with the blade and do not change its reach, collision, or control. Keep this decision Proposed until the owner checks the new shape in game.
