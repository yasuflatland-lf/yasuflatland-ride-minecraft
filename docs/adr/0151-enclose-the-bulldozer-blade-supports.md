# 0151. Enclose the bulldozer blade supports

- Status: Proposed
- Date: 2026-10-26
- Extends: 0136, 0138, 0148

## Context

The open space below each blade lift actuator shows through from the side. The owner wants a triangular side panel like the reference dozer, with rectangular panels closing its rear and underside, on both sides of the vehicle and both sides of each actuator.

## Decision

Keep the existing front slope from `(z, y) = (-19.5, 9.5)` to `(-13.9, 22.2)`. Set the rear lower corner to `(-10.0, 9.5)`, close to the apex so the rear slope is steep as in the owner's marked view. Close the triangle with yellow side skins at both x edges of each push arm. Use 0.4 px strips so the sloped outline stays close to straight. Span the arm's 7.5 to 9.5 px width with 0.4 px rectangular plates along the rear and lower edges. Cut both slopes off level with the angle cylinder's underside at y 12.6, so the support's flat bottom lies flush with it and no yellow hangs below it over the track: the lower corners move along their slopes to `(-18.133, 12.6)` and `(-10.952, 12.6)`, and the bottom plate spans between them. Mirror the complete support to the opposite side through `both()`. Keep every panel in `blade_rig` so it follows the blade lift, and bump the Resource Pack to 0.1.134.

## Consequences

The push arm slopes down toward the front under that level bottom, which left a gap of up to 1.5 px between the bottom plate and the arm's top. A yellow foot of 0.4 px strips across the arm's 7.5 to 9.5 px width fills it: each strip stands on the arm's top surface at its rear, higher end and rises to y 12.6 inside the bottom plate, so at most 0.07 px of the gap remains and nothing reaches below the arm's top line. The Resource Pack goes to 0.1.140 for it.

Each support reads as an enclosed triangular housing from either side. The panels move with the blade and do not change its reach, collision, or control. Keep this decision Proposed until the owner checks the new shape in game.
