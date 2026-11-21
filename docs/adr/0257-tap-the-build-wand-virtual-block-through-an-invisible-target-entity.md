# 0257. Tap the Build Wand virtual block through an invisible target entity

- Status: Proposed
- Acceptance condition: verify targeting, tap reach and single-press handling on iPad and existing wand controls on PC after runtime integration
- Date: 2026-11-21
- Supersedes in part: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 3's touch air-tap and long-press rules

## Context

On an iPad with BDS 1.26.66.1 and `@minecraft/server` 2.11.0, a short tap on empty air emitted no script event. Tapping a block emitted `playerInteractWithBlock` and a mining swing. Holding the wand in air repeated `itemUse` every four ticks. When the player's head faced the ground, the view ray hit a block and the wand discarded those repeats even when the finger pressed the virtual point. After two block taps the wand entered height adjustment with no hint that another press was needed.

A short tap on a one-block-wide, one-block-high entity three blocks away emitted `entityHitEntity`. A long press or the entity's interact button emitted `playerInteractWithEntity`. Both events identified the entity under the finger.

## Decision

1. In build mode, give each touch player one invisible `yasu_build:tap_target` when the end marker occupies air. In `point1` use the aimed end. In `baseHeight` and either menu level of `selected`, use the stored second tap. All other flows have no target. Use the preview aim sample and require readable air in the player's current dimension. Reuse a valid target within its current dimension and teleport it when the cell changes. Refresh removes the target when placement conditions fail, while build mode exit and session teardown remove it immediately. Sweep unmapped loaded targets across all three dimensions at startup.
2. Count a hit or interaction with the player's target as one wand press at that cell. Accept long presses during height adjustment and selection. Show a hint when the wand enters height adjustment.
3. Clamp touch virtual endpoints to the reach at which entity taps register. PC players keep the existing block and air right-click controls and reach.

## Consequences

The end marker stays visible through particles and its entity supplies the touch hit box. Structure saves exclude it through the build namespace. Device verification must establish the usable tap reach beyond the three-block probe.

Treating any press as “next” still leaves a short tap on empty air undetectable. Requiring a long press for air input would depend on repeated item uses without a stable release event and would still leave the finger's target unknown.
