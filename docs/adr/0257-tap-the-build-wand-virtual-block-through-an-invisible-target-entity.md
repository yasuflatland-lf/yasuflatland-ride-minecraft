# 0257. Tap the Build Wand virtual block through an invisible target entity

- Status: Proposed
- Acceptance condition: verify targeting, tap reach and single-press handling on iPad and existing wand controls on PC after runtime integration
- Date: 2026-11-21
- Supersedes in part: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 3's touch air-tap and long-press rules

## Context

On an iPad with BDS 1.26.66.1 and `@minecraft/server` 2.11.0, a short tap on empty air emitted no script event. Tapping a block emitted `playerInteractWithBlock` and a mining swing. Holding the wand in air repeated `itemUse` every four ticks. When the player's head faced the ground, the view ray hit a block and the wand discarded those repeats even when the finger pressed the virtual point. After two block taps the wand entered height adjustment with no hint that another press was needed.

A short tap on a one-block-wide, one-block-high entity three blocks away emitted `entityHitEntity`. A long press or the entity's interact button emitted `playerInteractWithEntity`. Both events identified the entity under the finger.

## Decision

1. In build mode, give each touch player one invisible `yasu_build:tap_target` when the end marker occupies air. In `point1` use the aimed end. In `baseHeight` and either menu level of `selected`, use the stored second tap (`flow.taps.to`). All other flows have no target. The entity has a one-block-wide, one-block-high hit box, takes no damage, and has no gravity or physical collision. Its client definition uses the empty stand-in geometry. Use the preview aim sample and require readable air in the player's current dimension. Reuse a valid target within its current dimension and teleport it when the cell changes. Refresh removes the target when placement conditions fail, while build mode exit and session teardown remove it immediately. Sweep unmapped loaded targets across all three dimensions at startup.
2. Route `entityHitEntity` and `playerInteractWithEntity` from a valid player holding the wand on their own tap target as a block press at the stored cell and dimension in the three target flows. Cancel every interaction with a tap target. Claim the same per-player debounce window as wand item use before deferring an eligible interaction through `system.run`, so paired events count once. The press fixes the endpoint in `point1`, confirms the live height in `baseHeight`, or opens the root shape menu in `selected`. Wand item use follows [0198](0198-one-build-wand-without-a-bulldozer.md) Decision 3. Entry into live base height aiming shows the hint specified in [0253](0253-persistent-build-selection-and-tool-swapping.md) Decision 1.
3. Clamp touch virtual endpoints to the reach at which entity taps register. PC players keep the existing block and air right-click controls and reach.

## Consequences

The end marker stays visible through particles and its entity supplies the touch hit box. Structure saves exclude it through the build namespace. Device verification must establish the usable tap reach beyond the three-block probe.

Treating any press as “next” still leaves a short tap on empty air undetectable. Requiring a long press for air input would depend on repeated item uses without a stable release event and would still leave the finger's target unknown.

## Manual verification

On iPad, tap a block for point 1 and tap the virtual block in air to set the end and show the height hint. Look up and down to change the live height, then tap the target to confirm it. Tap again to open the shape menu. Repeat with long presses and check that each press advances a single step. On PC, repeat the flow with right-click and compare it with the controls before this change.
