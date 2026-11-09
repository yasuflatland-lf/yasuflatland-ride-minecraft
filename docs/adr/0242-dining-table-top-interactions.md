# 0242. Dining Table top interactions

- Status: Proposed
- Acceptance condition: review of issue #1470 and mobile verification of lantern, oven, and block placement
- Date: 2026-11-09
- Extends: [0241](0241-dining-table-top-blocks.md)
- Extends: [0237](0237-register-tabletop-hosts-across-features.md)

## Context

The solid tabletop receives block taps instead of entity taps. Hosted items and
ordinary blocks need mutual exclusion without importing camp into resort.
Stable Script API 2.2 exposes playerPlaceBlock only as an after event.

## Decision

Register a tabletop custom interaction component that resolves its owner and
calls the injected PlaceHostedOnTop action. Other held items do nothing there.
An optional host blockedAt callback checks the clamped hosted footprint before
clearance, payment, and spawning; obstruction returns the overlap hint.

Cancel block interactions that would place a registered block item in a cell
above a tabletop overlapping a hosted footprint, using the clicked face to
calculate the destination. Show the localized top_occupied hint on the next
tick. Check side faces too, so neighboring blocks cannot bypass the guard.
Use this stable before-event instead of the unavailable before-player-place
event. Camp Table and Beach Chair omit blockedAt and retain their behavior.

## Consequences

The current one-cell Dining Table cannot fit an ordinary block and a hosted item
at separate points on the same top. Adjacent tables can hold them independently.
Footprint checks support future multi-cell tops. Commands and non-player block
changes bypass the interaction guard. Items whose block identifier differs from
their item identifier and replacement of replaceable vegetation require device
verification; the guard recognizes items registered under their block identifier.
Mobile interactions and the authored game scenario remain unverified.
