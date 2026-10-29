# 0150. Run the sports boat on lava

- Status: Proposed
- Date: 2026-10-26
- Supersedes in part: 0051 (water-only buoyancy and placement), 0080 (water-only afloat sensing)
- Extends: 0063 (docking on a liquid surface)

## Context

The sports boat floats and can be placed on water, but the Nether's lava seas stop both placement and movement. Its damage sensor already prevents hull damage, while riders can still take lava and fire damage.

## Decision

- Add lava and flowing lava to the sports boat's buoyant liquids. Sense either water or lava for its afloat drive and dock hold height, using the existing water motion settings.
- Let only the sports boat place on the top lava cell from a block interaction or liquid view ray. Keep the same clearance and shore placement rules as water.
- Make the hull and its dock seats fire immune. Refresh fire resistance and extinguish fire every tick for seated boat and dock-seat players. The effect lasts two ticks, so it ends shortly after dismounting.

## Consequences

The boat can be launched and driven across a lava sea with protected seated riders. The dock floor still covers only air above the liquid. A player who leaves a seat or walks off the deck can fall into lava after the brief effect expires. The `boat_lava` test passed on the dev BDS with the hull afloat and moving forward; confirm rider protection, docking, and speed by playing before accepting this decision.
