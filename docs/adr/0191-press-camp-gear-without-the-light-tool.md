# 0191. Press camp gear without the light tool

- Status: Proposed
- Date: 2026-10-30
- Supersedes in part: [0173](0173-remove-the-inside-lantern-and-add-the-gas-lantern.md) rule 12 (a press with another item or an empty hand does not switch); [0168](0168-a-dutch-oven-and-a-grill-for-the-fire-pit.md) rule 2 and the `isSimmering` note (simmering depends only on the host kind).

## Context

The owner wants to operate camp gear without finding the light tool first. The Gas Lantern currently switches only with `yasu_ride:headlight_switch` (0173), and the Dutch oven's lid state follows its host (0168). Ground and Camp Table lanterns should accept any press, and ovens should allow a lid toggle on every host.

A held touch repeats interactions every 4 to 6 ticks (0024, 0097). The existing `SwitchCooldowns` records every use, including suppressed repeats, so a continuous press flips once. Another cooldown or a separate application switch path would split that behavior between inputs.

## Decision

1. **Gas Lantern press (#971).** Pressing a Gas Lantern with an empty hand or any item switches it on or off, on the ground or on a Camp Table. PC right-click and the touch interact button / long press have the same behavior.
2. **Routing.** The Gas Lantern handler subscribes to `world.beforeEvents.playerInteractWithEntity`, accepts only `GAS_LANTERN_TYPE`, and skips `HEADLIGHT_SWITCH_TYPE`. It cancels an accepted interaction, captures the entity id, and defers `actions.switch(asGasLanternId(id), system.currentTick)` with `system.run` because before-events cannot mutate the world. Light-tool presses keep using `gasLanternSwitchTarget` in the switch router, with the vehicle target asked first.
3. **One flip per long press.** Every lantern press uses the existing `SwitchCooldowns<GasLanternId>` in `GasLanternActions.switch`, shared with light-tool hits. It must sit idle for `LIGHT_SWITCH_COOLDOWN_TICKS` (10 ticks) before another flip. Add no second cooldown or application switch path.
4. **Hits and feedback.** Hits switch the lantern only with the light tool. Other hits still count toward three-hit take-back and show the existing hint. Keep `random.click` (`SWITCH_CLICK_SOUND`) at the lantern and the interact text "Turn the Gas Lantern On / Off", with equivalent locale translations.
5. **Dutch oven lid (#972).** Initialize `yasu_ride:simmering` from the host at placement: true on a Fire Pit, false on the ground or a Camp Table. After placement, pressing the oven with any item or an empty hand toggles this property on every host. True means lid off, stew visible, bubbling and steam; false means lid on and stew hidden. The `isSimmering` host rule determines only the initial state, not the ongoing state.
6. **Oven persistence and repeats.** Use one per-oven `SwitchCooldowns<DutchOvenId>` with the same idle rule, so each long press flips once. Keep the selected state in the entity property across `/reload` and server restarts; do not recompute it from the host on load. Each flip plays a short vanilla sound at the oven, whose id lives in the camp spec. The interact text says what a press does (lid on / off). Taking back an oven and the Fire Pit's `covered` flag remain unchanged.
7. **Placement.** Placing an oven or lantern on a Camp Table targets the table entity, so pressing placed gear does not change table placement (0185).
8. **Scope and verification.** Issue #971 implements the Gas Lantern press and this ADR; #972 implements the Dutch oven toggle. Cover event cancellation, deferred switching, light-tool exclusion, and other entity types in handler unit tests. An in-game test has no player, so the in-game scenarios drive the same application action through a server-only scriptevent (`TEST_GAS_LANTERN_EVENT` for the lantern, an oven toggle event for the lid) instead of a real press.

## Consequences

Players can operate the two items with whatever they hold. Lantern hits retain their separate take-back behavior, so a touch tap without the tool still differs from a long press. The shared idle cooldown suppresses a second deliberate press made too soon, as it does for the light tool today.

An oven may show stew away from a Fire Pit or keep its lid on above one; simmering remains visual and consumes nothing. Revisit this choice if cooking or fire-dependent behavior is requested. Automated handler tests verify input routing, but touch timing still needs a manual client check because the in-game runner has no player.
