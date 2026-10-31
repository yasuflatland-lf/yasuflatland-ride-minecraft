# 0197. Emit camper hover particles below the discs

- Status: Proposed
- Date: 2026-10-31
- Amends in part: [0190](0190-ribbed-camper-shell-atlas.md) (hover glow addendum)
- Extends: [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md), [0184](0184-light-the-camper-roof-and-tail-lamps.md)
- Related: [0022](0022-fold-wheels-and-glow-in-flight.md)

## Context

After #1033 added the camper's hover discs, the owner reported that its hover
particles disappeared (#1035). The particle animation, form controller, effect
binding, and locators remain connected. Each new disc spans model y = -0.5 to 0,
while its particle locator stayed at y = 0. The particles start on the upper
surface and travel downward through the disc. This introduces occlusion where
there was previously no geometry. The SUV already emits at its discs' lower
faces. Client rendering has not been verified for this fix.

## Decision

Place the camper's four `hover_*` locators at y = -0.5, on the discs' lower
faces, keeping their x and z coordinates and their `body` parent. Derive this
height and the discs' depth from the same `GLOW_BOTTOM` constant. This amends
the instruction in 0190's addendum that the locators remain unchanged.

## Consequences

Particles leave the lower face instead of crossing the discs. Their effect,
rate, lifetime, motion, and animation gate remain unchanged, as does the shared
particle used by the SUV. Tests require each locator to lie at or below every
cube's lower face. A client check is still required to confirm visibility from
the chase camera, while banking, and from below.

## Addendum: PBR camper hover glow (2026-10-31)

Issue #1035 also extends 0147's emissive overlay to the camper's hover discs.
Add the existing `glow` swatch to the camper's lit slots alongside `lens`,
`dome`, `marker_amber`, and `marker_red`. Keep its palette index (38), UVs,
RGB (80, 170, 255), and paint-atlas alpha (40) unchanged. The lit atlas sets
its alpha to 0 for legacy full-bright rendering, and the MER atlas gives it
(0, 255, 255, 255), matching the lamps' maximum emissivity. All other MER
texels stay (0, 0, 255, 255), and the paint atlases gain no emissive texture set.

Hide `glow_*` in the base pass to avoid double drawing. Add a separate `.glow`
render controller using the same geometry, `Texture.lit`, and `Material.lamp_lit`
(`entity_emissive`). Hide all bones by default and show only `glow_*` when
`!query.property('yasu_ride:gear_down')`, the discs' existing visibility rule.
Use the same condition for the client entity's controller entry. This keeps
the discs hidden with the gear down and independent of both lamp switches;
the existing `.lit` lamp pass keeps its rules. Bone animations apply to both
overlays, and the particle fix above remains in place.

The Resource Pack and the Behavior Pack dependency use version 0.1.219 (0015).
No new light blocks are placed. Legacy clients use the lit alpha mask, while
Vibrant Visuals clients use the MER emissivity. Rendering needs an owner check
on a Vibrant Visuals device in flight and hover, with lamps off and on, and
with the gear down; automated tests verify the assets and wiring only. The
SUV hover discs have the same PBR gap and remain a separate follow-up.
