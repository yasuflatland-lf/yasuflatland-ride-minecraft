# 0219. Remove the SUV headlight bezel plate

- Status: Accepted
- Date: 2026-11-04
- Supersedes in part: [0192](0192-suv-detailed-body.md): the `headlight_bezels` bone and its `entity_alphatest` cutout material
- Related: [0015](0015-dev-server-docker-nethernet.md): bump the Resource Pack version so devices drop the cached geometry

## Context

0192 put a body-coloured square plate 1.25 times the lens size, with a circular cutout and six screws, in front of each round headlight. In game the plate reads as a thin square panel standing proud of the Rubicon front fascia, and the owner asked for it to go.

## Decision

- Remove the `headlight_bezels` bone, its cubes, the `bezel` region of the headlight painter, and the `lamp_cutout` material with its render controller entry.
- Keep the square lens cubes. Texels of the lens face outside the lens circle take the paint's body colour and are opaque, so the square face blends into the fascia without a cutout material.
- Bump the Resource Pack and the Behavior Pack dependency to 0.1.251.

## Consequences

- The lens corners are flat body colour and are shaded like the lens slab, so a faint slab edge can remain visible. If that shows on a device, make the lens a disc instead.
- The screws that ringed the lens are gone.
- Appearance on a device is unverified.

Integration with main uses Resource Pack 0.1.252 and the matching Behavior Pack dependency because main already uses 0.1.251.
