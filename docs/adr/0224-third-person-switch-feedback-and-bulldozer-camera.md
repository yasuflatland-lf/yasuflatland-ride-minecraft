# 0224. Show third-person switch feedback and bring the bulldozer camera closer

- Status: Accepted
- Date: 2026-11-05
- Extends: [0020](0020-headlights.md): action-bar confirmation for chase-camera riders
- Extends: [0028](0028-third-person-camera-in-flight.md): share successful camera tracking with switch feedback
- Extends: [0071](0071-pull-the-camper-chase-camera-back.md): bulldozer uses the existing mid preset
- Extends: [0139](0139-show-the-held-tool-on-the-cab-monitor.md): localized confirmation when the cab monitor is out of view
- Related: [0136](0136-bulldozer.md): bulldozer profile

## Context

The existing switch router already accepts tool and headlight switches while flying. Chase-camera riders cannot read the cab monitor or reliably see the headlight state, so successful switches lack visible confirmation. The bulldozer's far camera also frames it too distantly. The owner approved action-bar feedback and the existing mid camera for the bulldozer.

## Decision

- Keep the existing switch interactions, driver checks and cooldowns. After a successful tool or headlight switch, show the new state only to the player who switched and whose chase camera is tracked by the shared application `RiderEffects`.
- Expose `RiderEffects.isThirdPerson(playerId)` and share that instance with `DriveVehicles` and `SwitchFeedback` at installation. Tracking changes only after a successful camera set or clear; failed changes retain the last successfully applied state (0052). Do not infer camera state from a flight check or query the player's own perspective.
- Keep `SwitchEquipment.execute` and `SwitchHeadlights.execute` returning boolean. Expose the drive's post-switch target through `Vehicle.equipmentState(cmd.switch)`. Each kind's equipment switch declares a feedback prefix. Through the shared `SwitchMessages.messageFor` contract, equipment switches return `<prefix>_<state>` for declared states with a prefix, and the lighting domain maps the two headlight states. Unsupported states produce no message.
- Use the shared `equipmentBindings` helper in each monitor-equipped drive. It checks the item and state against the equipment rule before returning a state or writing it through the drive's binding.
- Deliver messages through the existing `showMessage` rider port and `player.onScreenDisplay.setActionBar`, using `yasu_ride.message.<name>` translations in both English and Japanese. Show blade target states immediately, without waiting for lift easing. Do not add ceiling-light feedback or messages for failed, unauthorized or cooldown-rejected switches, or the server-only force hook.
- Select `mid` for the bulldozer's profile: the existing `yasu_ride:mid_chase` preset has radius 8 blocks. SUV stays mid, camper stays far (12 blocks), and sports boat stays near. No entity, model or camera preset JSON changes are needed.
- Bump the Resource Pack version and the Behavior Pack dependency for the added translations (0015).

## Consequences

Chase-camera drivers can confirm switches without seeing the cab monitor or lamps. Grounded and first-person riders receive no additional feedback in the current camera routing. A new equipment switch defines its feedback prefix alongside its states and supplies translations for each state. Action-bar messages are transient and may be replaced by later messages; no repeating overlay or queue is added.

The script tracks the camera it applied, not a camera a player or another add-on selected. A failed clear retains feedback until clear succeeds. Unit tests cover mapping, translations, successful-switch gating and camera failures, but visible framing and action-bar rendering still need a PC/mobile check.
