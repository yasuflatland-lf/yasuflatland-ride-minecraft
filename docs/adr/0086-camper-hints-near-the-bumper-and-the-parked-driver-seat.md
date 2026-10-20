# 0086. Show camper hints near the bumper and the parked driver's seat

- Status: Accepted
- Date: 2026-10-20
- Extends: 0068, 0084

## Context

The camper takes hits only through the three 1 x 1 x 1 hitboxes on its front bumper (0068, 0084). Getting in, hitting it back into its item, and painting it with a dye all go through those boxes, and nothing in the game tells a player so. Once the camper is parked, its driver's seat is a deck seat (0063, 0068): a player takes the wheel by using that seat, which is a long-press on a phone and a right-click on a PC. The owner asked for a message near the bumper ("hit the bumper to break it back into its item or change its color") and one near the parked driver's seat ("long-press the seat to drive").

The SUV and the sports boat take hits on their whole body, so they need no such hint.

"Hit" is Minecraft's own word for the attack on every input (a tap on touch, a left-click on a PC), so the break and paint part reads the same everywhere. The interact has no shared name players recognize, and a neutral "use the seat" does not tell a phone player to long-press. The stable `@minecraft/server` 2.x exposes `player.inputInfo.lastInputModeUsed`, so each player can get the gesture of the input they use.

## Decision

- A vehicle kind declares where it shows hints in an optional `hints` field of its profile (0050). A kind without it shows none; the SUV and the sports boat leave it out. The camper declares:
  - a bumper zone: the rectangle the hitboxes cover (`CAMPER_SPEC.bumperBoxXs`, `bumperBoxSize`, at `bodyFront`), with a 1.5-block reach on the ground plane and feet from 1 block below to 1.5 blocks above the camper's feet. Players inside the body footprint (the parked room) are left out, because the boxes reach half a block into it
  - a driver's seat zone: 1.5 blocks around the profile's seat 0, with feet 0.5 to 3.5 blocks above the camper's feet (on the room floor, below the roof). It shows only while the camper is parked and nobody sits in seat 0 or on its deck seat, and only to a player at least as near seat 0 as any other seat: the front passenger seat is exactly 1.5 blocks away, and a long-press next to it takes that seat, which does not drive
- Players on foot only: a player riding anything gets no hint. Where both zones apply, the driver's seat wins
- While anyone sits in a seat of the camper itself, hits do not break it (0008) and the seats may all be taken, so the bumper zone shows no pick-up hint then; the paint hint still shows, because painting works with riders aboard
- The hints are sent with `setActionBar` as a raw text that translates `yasu_ride.hint.<name>`:
  - `bumper_touch`, `bumper_mouse`, `bumper_other`: hit the bumper `%s` times to pick up the `%s`, and long-press, right-click, or use it to get in. The count is filled with `SPEC.hitsToBreak`, so the lang text never repeats the number
  - `paint`, when the player holds a dye: hit the bumper with it to paint the `%s`
  - `drive_touch`, `drive_mouse`, `drive_other`: long-press, right-click, or use the driver's seat to drive
  - The vehicle's name fills its `%s` as a nested translation of the kind's `entity.yasu_ride:<kind>.name`, so the keys stay kind-neutral and another kind's hints name that kind
- The input mode picks the variant: Touch is `touch`, KeyboardAndMouse is `mouse`, and a gamepad, a motion controller, or a read that throws get the neutral `other` wording, so no player sees the gesture of a device they are not using
- Timing, in core `SPEC` because it is shared UX: a check every 5 ticks (`hintCheckInterval`), registered right after the drive interval so it reads this tick's parked state; the same hint is re-sent every 40 ticks (`hintRefreshTicks`) for 100 ticks (`hintShowTicks`) after it first shows, then the player is left alone until they leave the zone or another hint applies (such as picking up a dye). A shown hint keeps showing until 0.5 blocks past every edge of its zone (`hintExitMargin`): past its reach, into the body footprint the bumper zone leaves out, and past the point where another seat is nearer. A player who walks into the front of an unparked camper's square collision box can stand on the body's front line, and without the margin there the hint would be re-sent on every check
- Leaving the zone on foot clears the action bar once with an empty text. Mounting does not clear it: the game's own dismount tip replaces the hint, and an empty text would wipe that tip

## Consequences

- A player who walks up to the camper learns how to get in, pick it up, and paint it, and a player in the parked room learns how to drive, in their own language and with their own gesture
- The bumper hint geometry reads the same `CAMPER_SPEC` values as the hitbox test, so the two cannot drift apart
- The action bar's display time is not documented; the 40-tick refresh assumes it stays up for more than 2 seconds. Measure it on a phone and on a PC, and lower the refresh if the hint blinks
- The empty clear also wipes any other action-bar text the player had at that moment. If that shows up in play, drop the clear and let the hint fade
- `lastInputModeUsed` reports the last input used, so a phone with a keyboard attached can switch variants mid-hint; the new variant shows at once
- The exit margin widens only the zone of the shown hint; priority between zones applies only when a new hint is chosen, so a widened driver's seat zone cannot take over a shown bumper or paint hint ([#355](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/issues/355))
- Another kind can get hints by adding `hints` to its profile, for example the sports boat's driver deck seat (0063)
