# Nav hints: map progress and long-press guidance

## Intent

A player on touch held the Nav while driving, tapped the screen, and nothing happened. On touch, the Nav menu opens only on a long press, and a short tap on empty air emits no script event at all (as measured in the build tap spike). A second gap: after a destination is chosen, the explorer-map search runs synchronously inside one tick, so the game appears to freeze with no feedback.

## Goals

1. After a destination is chosen, the rider sees "Creating a map to <destination>..." on the action bar before the search starts.
2. A rider (driver or passenger) who selects the Nav in the hotbar sees how to open the menu, worded for their input: long-press on touch, right-click on mouse, neutral otherwise.
3. A rider who taps with the Nav where a tap is detectable (a block or an entity, including their own vehicle) sees the same guidance again.
4. Passengers can use the Nav too: any player riding a vehicle, in any seat, can open the menu and receive a map. This replaces the seat-zero-driver rule of ADR 0261.
5. Radar reports reach passengers too: every rider of a vehicle receives the radar reports, not only the driver.

## Non-goals

- Detecting taps on empty air. The engine emits nothing for them.
- Changing what a tap on the vehicle already does (damage, painting, bumper return in `hits.ts`).
- A progress bar or an estimate of search time.
- Changing what the radar detects, its scan interval, radius, clustering, or report format.

## Approaches

- A. Hint on hotbar selection only. Reliable, shown before any tap, but gone once the action bar fades.
- B. Hint on detectable taps only. Shown at the moment of confusion, but misses the common case of tapping the sky.
- C. Both. **Chosen by the user**: the selection hint prevents the confusion up front, and detectable taps cover a player who missed it.

The progress message has one sensible way: write it, then start the search a couple of ticks later. Writing it in the same tick as the search delivers it together with the map.

## Design

- Progress: `OpenNav` asks the world to show `nav_creating` with the destination label, waits a short delay (spec constant, about 2 ticks), rechecks that the player still rides the same vehicle, then calls `giveMap`. The pending-selection guard stays held through the delay so a second press is still ignored.
- Access: `OpenNav` accepts any rider of the vehicle instead of only `driverId`, in the menu check and in the recheck after the choice. Riders in different seats each have their own pending-selection guard. A player on foot gets a renamed "use the nav while riding a vehicle" message in place of the driver-only message; the Overworld-only rule stays.
- Selection hint: on `playerHotbarSelectedSlotChange`, when the new item is the Nav and the player rides a vehicle, show the guidance once.
- Tap hint: on `playerSwingStart` by a rider whose held item is the Nav, show the guidance, rate-limited per player (spec constant, about 40 ticks) so repeated taps do not spam the action bar. The touch spike measured a swing for a block tap (`Mine`) and an entity tap (`Attack`), and nothing for an air tap, so this one event covers every detectable tap. No guidance is shown while the player's nav selection is pending, so a swing during a long press cannot overwrite the menu flow or the progress message.
- Wording: new lang keys in `en_US.lang` and `ja_JP.lang`, `_touch`, `_mouse`, `_other` variants following the existing `hint.drive_*` pattern and `controlsOf` in `bedrockHintWorld.ts`. Japanese wording conveys that a map to the destination is being created and that a long press opens the map menu.
- All writes go through the shared `ActionBarLog` so the radar keeps its quiet window.
- Radar: `ScanForPlaces` scans vehicles that have at least one rider, not only a driver, keeping one vehicle per interval in repository order. Each rider keeps their own radar memory per dimension, so a place is reported once per rider and ride, and one rider's busy action bar does not hold back another's report. A scan offers its clusters to every rider's memory. A rider's memory is cleared when that rider gets out or the vehicle leaves the repository; other riders keep theirs. The 60-tick quiet window stays per player.
- Players on foot get no guidance hint; using the Nav shows the riding-only message.

## Constraints

- Stable Script API only (ADR 0001); layers and feature boundaries per ADR 0012 and 0046. Decision logic (who gets a hint, rate limit) in application or domain with tests; event wiring in `src/infrastructure/vehicle/bedrock/`.
- Resource Pack manifest bump for the lang changes (ADR 0015).
- Update the Decision and Consequences of ADR 0261 in place for rider access to the nav and to radar reports (no new ADR), `docs/specs/navigation.md`, and the Nav rows in `docs/manual-test.md`. The passenger scenario checks that access is allowed.

## Left to the builder

- Exact delay and rate-limit values, placed in the vehicle `SPEC`.
- Whether a scenario can cover the progress message ordering; otherwise unit tests plus a manual check on touch.
