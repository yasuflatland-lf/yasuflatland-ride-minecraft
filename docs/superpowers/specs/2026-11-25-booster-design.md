# Booster: a flight boost for every flying vehicle

## Intent

The owner crosses a wide world and flies across it, and wants to cover that distance faster. The booster is a held item, used from the driver's seat, that triples the top speed and climb limit of a flying vehicle until the driver gets out. It sits beside the headlight switch as another item the driver uses while riding.

Before the booster, the equipment-switch code it neighbours gets a behavior-preserving cleanup (Phase 0), so the booster lands on clear names and typed handles instead of the current monitor-tool strings.

## Goals

- Phase 0 (own pull request, no behavior change): rename the cab monitor tool mechanism to what it is, an equipment switch of the vehicle's kind, and stop passing item and state names as bare strings inside the domain.
- Phase 1: the item `yasu_ride:booster`. While riding as driver, using it toggles the boost. While the boost is on and the vehicle is in its flight form, top speed and climb limit are 3 times the kind's values. Acceleration stays as the kind defines it.
- The boost stays on when the driver switches to another held item. It ends when a new driver takes the wheel, and never carries to the next driver.
- It works on every kind that flies: SUV, camper, scooter, bulldozer.
- On a kind that cannot fly (the sports boat) using the item changes nothing and tells the player the vehicle cannot use a booster.

## Non-goals

- No change to acceleration, ground speed, water speed, submarine speed, takeoff climb or landing sink.
- No change to ramming. Ram damage and push scale with speed, so a boosted ram hits about 3 times as hard. This is accepted.
- The boost is not saved with the vehicle. It is gone when the driver leaves, so nothing needs restoring after `/reload` or a chunk reload.
- No change to the cab monitor screens, the pack art of existing items, or any wire name (see Phase 0).

## Anti-goals

- The boost must never raise ground, water or submarine speed, even when it is switched on while in those forms.
- It must never survive to the next driver, including a passenger who moves up to seat 0 during a handover (ADR 0078).
- A release (switched off, landing, driver leaving) must not cut speed to the normal cap in one tick.

## Constraints

- Stable Script API only (ADR 0001); layer and feature rules of ADR 0012, 0046, 0055, 0072 hold, checked by `pnpm lint:deps`.
- The vehicle core cannot import `motion/` or `kinds/`. The boost effect lives in `motion/`, the boost's availability in each kind's data.
- Per-vehicle values follow ADR 0050: the multiplier is one shared constant, and each kind opts in through its own spec.
- Phase 0 ships in its own pull requests, before the Phase 1 pull request that uses them, as AGENTS.md asks for refactors that precede a new vehicle feature. Phase 1 work that does not touch the refactored code (the flight boost in `motion/` and the drive, the item pack files) may run in parallel.
- Resource Pack manifest version bumps when pack files change (ADR 0015). Phase 0 changes no pack file.

## Findings that shaped the design

- Air speed is capped directly: `updateSpeed` clamps to `limits.maxSpeed`, `targetVelocity` clamps the vector length, and `stepMediumMotion` uses `min(limits.maxSpeed, medium.maxSpeed)`. Drag does not set the top speed, so scaling the caps scales the speed.
- `MotionState.speed` is shared by the ground, air and water steps, and the ground step uses the unboosted limits. Dropping the cap therefore cuts speed in a single tick on landing, on switching off, and on dismount.
- Only the sports boat and the bulldozer have a cab monitor. The SUV, camper and scooter have none, and the monitor shows every tool, so putting the booster there would add screens and pack art to three kinds for an item that shows nothing.
- The headlight state lives on the entity and survives dismount. The monitor tool state lives in the drive and is restored from entity properties. The boost state is transient, so it follows neither.

## Phase 0: equipment-switch refactor (no behavior change)

A. Naming. The mechanism that lets the driver cycle a persistent state of the kind's equipment with a held item is the equipment switch. The cab monitor only displays it.

- New core subfolder `src/domain/vehicle/equipment/` holds the definition of a switch (item, ordered states, feedback), the per-kind rule, the bindings from a switch to a drive field, state cycling, and the switch policy (driver only, idle cooldown). `monitor/` keeps only the screen: `monitorScreen` and the display sync of `CabMonitor`.
- Renames: `MonitorRule`/`MonitorTool` to `EquipmentRule`/`EquipmentSwitch`; `toolBindings` to `equipmentBindings`; `Vehicle.switchTool`/`toolState`/`forceTool` to `switchEquipment`/`equipmentState`/`forceEquipment`; `Drive.toolState`/`setToolState` to `equipmentState`/`setEquipmentState`; `SwitchTool` to `SwitchEquipment`; `handlers/toolSwitch.ts` to `handlers/equipmentSwitch.ts`; `MONITOR_TOOL_ITEMS`/`MONITOR_TOOL_TYPES` to `EQUIPMENT_SWITCH_ITEMS`/`EQUIPMENT_SWITCH_TYPES`; `bulldozer/monitor.ts` to `bulldozer/equipment.ts`; `BULLDOZER_MONITOR`/`SPORTSBOAT_MONITOR` to `*_EQUIPMENT`; `profile.monitor` to `profile.equipment`.
- Wire names do not change: item ids, `MONITOR_PROPERTY_NAME`, the test-hook script event, lang keys, and every file under `packs/`. No Resource Pack version bump.

B. Typed handles. Item and state names are parsed once at the outer boundary and the domain passes typed values.

- The infrastructure maps a Bedrock item type id to an `EquipmentSwitch` handle through a registry exported by `kinds/index.ts`. `Vehicle.switchEquipment` and the use case take the handle, not a string.
- A switch declares its states as a typed tuple. The generic use case asks the drive to cycle a handle (`cycleEquipment(handle)`) and no longer builds state strings. Bare state names remain only where they enter from outside: the test hook, validated against the handle's states at that boundary, and the entity-property restore.
- Feedback comes from the handle (`feedbackFor(state)`), replacing the string lookup `toolFeedback(item, state)`.

C. Consistency with the headlight switch. These changes are needed so the booster does not add a third special case:

- `SwitchFeedback` stops comparing `item === "headlight_switch"`. Headlights and every switch report through one feedback key mechanism, and the booster joins it.
- The switch route table in `subscriptions.ts` keeps one route per item type with a `SwitchTarget`; the equipment switch target and the headlight target keep their current claim rules. The headlight state, its cooldown and who may press it do not change.

Existing tests move with the renames (domain monitor and tool tests, `switchTool`, `subscriptions`, pack tests that read the monitor tool items). ADR 0090 (subfolder list), 0139 and 0171 and the affected specs are edited in place to the new names.

## Phase 1: the booster

Behavior (rules the tests check):

1. Using `yasu_ride:booster` while riding toggles the boost for that vehicle. Only the driver can press it; there is a cooldown separate from the headlight switch and the equipment switches, with the same length as the headlight's (ADR 0171 keeps tool cooldowns separate from lights).
2. While the boost is on and the form is flight (not car, not submarine), the air step uses 3 times `maxSpeed` and 3 times `maxClimb`. Acceleration, brake, drag, `takeoffClimb` and `landingSink` are unchanged.
3. Raising the cap is immediate (acceleration still limits how fast speed grows). Lowering it is gradual: the cap falls toward the kind's normal value by a fixed share of that normal value each tick, so a release bleeds the extra speed instead of clamping it in one tick. This covers switching off, landing and the driver leaving, and the same cap is used by the car step while it falls.
4. The boost is off whenever the vehicle has no driver or is waiting for a handover, and it is cleared when a new driver mounts. A passenger who moves up starts without the boost.
5. The state is not saved. It is not shown on the cab monitor.
6. A kind without flight does not offer the control. Using the item there changes nothing and shows "this vehicle cannot use a booster" in the action bar.
7. Switching the boost on in car or submarine form is allowed and has no effect until the vehicle is in flight form.
8. Third-person riders see "Boost ON/OFF" in the action bar as with the headlight switch (ADR 0224).

Parts:

- Value object `BoostRule` (`flightScale`), set optionally in each flying kind's spec from one shared constant `MOTION.boostFlightScale = 3` and `MOTION.boostBleed`. A kind without the field cannot boost.
- Pure functions and a small state in `motion/boost.ts`: derive the boosted limits and medium, and the falling cap. They are applied in `TransformingDrive` only to the flight step and the vertical clamp in `airImpulse`.
- State and its clearing live in `TransformingDrive` (clear in `onDriverMounted`). The vehicle core exposes the control to the application through a core-defined capability key, offered only by drives whose spec has a `BoostRule`.
- Application use case `SwitchBoost` modelled on `SwitchHeadlights` and `SwitchEquipment`. Infrastructure adds a `boosterSwitchTarget` with the same claim rules as the equipment switch target, a route for the item type, and the click sound.
- Item `yasu_ride:booster`: single stack, icon and `en_US`/`ja_JP` lang entries, creative catalog entry, in the same group as the headlight switch. The Resource Pack version is bumped.

## Approaches

1. **State and effect in the drive, availability as kind data, new entry (chosen).** The state sits beside the speed logic that reads it; one pure module holds the effect; the core only enforces driver and cooldown.
2. Per-kind boosted spec swapped in while boosting. Leaves the shared flight step untouched, but copies the same block into four specs, mixes configuration with state, and the limits object is shared with the ground step, so the ground would speed up too.
3. Boost state held in the vehicle aggregate and passed each tick as a flag in `TickContext`. Puts a flight-only rule in the kind-neutral core and shows a boost flag to the sports boat.
4. Make the booster another cab monitor tool. Reuses cooldown and role checks, but needs monitor screens and art for three kinds without a monitor and ties a screenless, transient item to a persistent, displayed mechanism.

For the speed drop on release: clamping at once (rejected: three-fold speed loss in a tick), deferring the switch-off until landing (rejected: the control stops matching the item), and keeping the boosted cap on the ground (rejected: breaks the flight-only rule). A falling cap is chosen.

## Decided calls (Claude's, open to correction)

- The boost applies only to the flight form, including for the bulldozer, whose normal top speed is 0.45 (so 1.35 boosted).
- Climb limit means `maxClimb` (up and down). The takeoff climb is left alone.
- The multiplier is one shared constant, not a per-kind value, because every kind uses the same factor; the optional `BoostRule` is the per-kind opt-in and the place to change a kind later.
- The bleed is a share of the kind's normal top speed per tick. The starting value is 0.1 per tick (20 ticks from 3 times down to once), to be set by measurement in game.
- Ram damage is not capped (the owner's call).
- The refusal message is shown in any camera, since the player has no other way to learn why nothing happened.
- Switching on while in car or submarine form is allowed.
- The cooldown is a new `SPEC.boosterSwitchCooldown`, equal to the headlight switch cooldown.
- The vertical climb gets no falling cap unless measurement shows a jolt on release; if it does, the builder applies the same bleed to it.

## Left to the builder

- Exact names of the new files, types and capability key, and where the typed registry for the equipment switches lives, within the rules above.
- The first value of `MOTION.boostBleed`, measured on the dev BDS.
- Whether the boosted climb needs the same bleed.
- How the boosted air medium and limits are built per tick without extra allocation.
- The item's icon and lang text. The item is creative-only, with no recipe.
- Tests: property tests that the boosted limits only change `maxSpeed` and `maxClimb`, that the falling cap never rises on its own and ends at the normal value, and that nothing but the flight step reads it; unit tests for the driver-only rule, the cooldown, the clear on mount, the handover wait, and the refusal on the sports boat; in-game scenarios for each flying kind covering a boosted run into a wall and across chunks at about 2.7 blocks per tick, takeoff and boosted climb, switching off in the air, landing at boost speed, driver leaving, a handover, the bulldozer's paving and cutting in the air, and the sports boat refusal, each with its `CATALOG` entry.
- Docs: a new ADR for the booster, specs `flight-and-submarine.md` and `vehicle-items-and-fleet.md`, `pnpm run docs` for the index, and the ADRs and specs touched by Phase 0.

## Owner decisions

- The booster is obtained from the creative catalog only. A crafting recipe can be added later as a separate small change.

## Pull request plan

Seven pull requests, one issue each, titled `[n/7]`. Waves list what can run in parallel.

| n/7 | Scope                                                                                                          | Depends on | Wave |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| 1   | Rename the monitor tool mechanism to equipment switch, split `equipment/` from `monitor/` (no behavior change) | none       | 1    |
| 2   | Typed equipment-switch handles instead of item and state strings                                               | 1          | 2    |
| 3   | One feedback mechanism for headlights and every switch                                                         | 2          | 3    |
| 4   | Flight boost in `motion/` and the drive, kind opt-in, core capability key (no player entry yet)                | none       | 1    |
| 5   | Booster item pack files and lang (creative only)                                                               | none       | 1    |
| 6   | Driver entry: vehicle method, use case, route, feedback, ADR and specs                                         | 3, 4, 5    | 4    |
| 7   | In-game scenarios and the test hook                                                                            | 6          | 5    |
