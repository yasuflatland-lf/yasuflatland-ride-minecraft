# 0196. Raise the SUV seats for first-person visibility

- Status: Proposed
- Date: 2026-10-31
- Supersedes in part: [0194](0194-enlarge-the-suv-for-seated-head-clearance.md) (rideable seat height and clearance estimates)

## Context

Issue #1029 reports that the driver's eye at seat y=0.58 sits only about 0.1 block above the hood and dashboard, hiding the horizon when looking slightly down. The owner tried y=0.73 on the dev BDS and confirmed that the horizon is visible and the head stays under the roof. The earlier head model estimate was too low; it does not establish actual client head or eye height. The new seat height is an observed value, not a value derived from that estimate.

## Decision

Raise all four SUV rideable seats by 0.15 block, from y=0.58 to y=0.73, and match the cow seat probe (0019). Preserve every x/z coordinate, seat cushion and `seat_*` bone. Keep the Resource Pack and its version unchanged: only Behavior Pack entity definitions change (0015).

Retain the existing standard-player head estimate as a geometry regression guard, including its 0.5 px margin against the roof and raked windshield. At y=0.73 it predicts a head top of `0.73 * 16 + 24.06875 = 35.74875` px beneath the unchanged roof underside at 37.555 px. Estimated roof clearance falls from 4.20625 to 1.80625 px, leaving 1.30625 px after the margin. The grown head must still be separated from every leaning windshield frame part and the sealed glass; do not relax those checks to accommodate the higher seats.

`SUV_PROFILE.seats.positions` contains only x/z. Seat assignment, the domain seat tests and the `seatsAfterDriverLeaves` scenario use those horizontal coordinates and require no height adjustment.

## Consequences

The owner's check establishes first-person visibility and head clearance for the tested client setup. The geometry estimate remains a regression guard, not a measurement of animated players, armor or arbitrary skins. The seat cushions stay at their existing height.

Entity definitions require a server restart. This implementation does not start or restart the dev BDS or run in-game tests. The seat probe and SUV boarding scenarios still need verification under the BDS lock; broader PC and touch checks from 0194 remain outstanding.
