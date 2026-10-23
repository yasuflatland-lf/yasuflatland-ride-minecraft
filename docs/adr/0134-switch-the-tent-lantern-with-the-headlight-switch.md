# 0134. Switch the tent lantern with the headlight switch

- Status: Proposed (to be Accepted once the manual checks under Tent lantern in [manual-test.md](../manual-test.md) pass)
- Date: 2026-10-23
- Extends: [0024](0024-item-use-on-mobile-and-longer-headlights.md) (the switch cooldown), [0115](0115-camper-ceiling-lights.md) (ceiling lights switched from inside a room), [0131](0131-pitch-a-tent-in-the-camp.md) (the tent's cells and shelter), [0129](0129-share-room-primitives-between-features.md) (the shared switch router)

## Context

The owner wants one way to switch every light in the add-on: the headlight switch item
(0020, 0024, 0115). The pitched tent's model has a hanging lantern (0130): the bones
`lantern` and `lantern_glass`, the synced bool entity property `yasu_ride:lantern`, and a
glow material the render controller picks from that property. Nothing switched it.

The lantern is part of the tent, not camping gear. Placing the oil lamp or other gear in
the tent stays out of scope.

## Decision

- **Who may switch.** A player inside a tent's rooms (`insideTent`) who rides nothing, or
  rides a Low Chair, switches that tent's lantern with the headlight switch. A rider of
  anything else (a vehicle, a deck seat, a horse) never reaches the lantern.
- **Target order.** Camp contributes one `SwitchTarget` through bootstrap. The vehicle
  feature's single switch router asks the vehicle target first, then the tent lantern, so
  a driver inside a tent's box still switches the headlights. No second router exists.
- **Presses.** Any block press with the switch inside a tent is taken over and cancelled,
  every repeat of a long press included, so the switch never also opens a flap or starts
  a sleep, as in the camper room (0115). Entity presses keep their default
  (`claimsEntityPress` is false), so a Low Chair can still be pressed.
- **One cooldown per tent.** `SwitchLantern` keeps one `SwitchCooldown` per tent, shared by
  everyone in it, with the 10-tick cooldown of 0024. A cooldown idle for its full length
  is dropped, which behaves exactly like a fresh one.
- **The lantern cell.** The front-room ceiling cell in front of the bedroom door (local
  x 0, depth 7, layer 3) holds `yasu_ride:tent_lantern` instead of `tent_ceiling`. The
  lantern takes no interior cell, so chairs and blocks still fit everywhere inside and the
  roof stays closed. A tent saved before this change is relaid by the normal diff.
- **Light.** `tent_lantern` has the ceiling block's components and a `yasu_ride:lit` state.
  Off, it emits `TENT_SPEC.ceilingLight`, so the shelter never drops to block light 0;
  on, it emits 15 (`TENT_SPEC.lanternLight`), the camper's ceiling light level.
- **Saved state.** The entity property `yasu_ride:lantern` is the only saved state. It lives
  through `/reload` and a restart with the entity; the tent loop reads it every tick and
  lays the lantern cell from it, so a restored tent shows its lantern on its first tick.

## Consequences

- The tent's Resource Pack files are unchanged; the glow comes from 0130's material.
- Camp still imports nothing from vehicle: the click sound and the block state ids are
  camp's own constants.
- The block-press takeover covers the whole tent, so pressing anything inside with the
  switch never reaches that block's own behavior: a flap
  ([0132](0132-open-and-close-each-tent-flap-alone.md)) stays as it is and a mattress
  ([0133](0133-sleep-on-the-tent-mattresses.md)) starts no sleep.
- `TentState` carries `lanternOn` next to 0132's `openFlaps`, and the tent loop builds
  both every tick. The lantern cell is a ceiling cell, so it never meets a flap or a
  mattress cell.
