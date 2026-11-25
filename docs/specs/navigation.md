# Navigation

- Scope: The Nav item, driver access, destination selection, and delivery of vanilla explorer maps.
- Verified at: 4316b7e76
- Source: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md)

## Rules

### Driver access and selection

- Applies to: Using the Nav item in the air or pressing the vehicle the player is riding.
- Rule: A player outside the driver's seat receives the translated driver-only message. The driver must be in the Overworld to open the destination form. A second press by the same player is ignored while their selection is pending. Cancel gives no item. After a choice, the driver must still be in the driver's seat of the same vehicle before a map can be delivered.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision.
- Implementation: `src/infrastructure/vehicle/bedrock/handlers/navSwitch.ts`, `src/application/vehicle/openNav.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`.
- Verification: `tests/application/vehicle/openNav.test.ts` checks the order, cancellation, seat recheck, and repeated presses. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks air and vehicle press routing. The `suv_nav_passenger_refused` scenario checks refusal with two seated probes and awaits an in-game run.

### Menu and map delivery

- Applies to: The destinations offered to an eligible driver.
- Rule: Each confirmed destination has a localized menu label and one loot table at `loot_tables/yasu_ride/nav_<destination>.json`. The list is currently empty and no form opens. The command adapter has inventory and feet-drop paths. A command success count cannot distinguish a blank map from a filled explorer map.
- Agreement: Proposed
- Basis: [0261](../adr/0261-navigation-by-explorer-maps-and-a-mob-radar.md) Decision and Consequences.
- Implementation: `src/domain/vehicle/navigation/destinations.ts`, `src/infrastructure/vehicle/bedrock/bedrockNavWorld.ts`, `src/infrastructure/shared/choiceForm.ts`.
- Verification: `tests/packs/nav.test.ts` checks that the shipped tables match the destination list and have labels. `tests/infrastructure/vehicle/bedrock/bedrockNavWorld.test.ts` checks form answers and both command paths with test data. Player-origin and rendering checks are in [Manual test](../manual-test.md#nav-explorer-maps).

## Open issues

- ADR 0261 calls for maps to the nearest unexplored destination. The [recorded spike](../superpowers/specs/2026-11-25-driving-navigation-design.md#spike-results) found no filled maps in the flat test world. Confirm destinations, search cost, and player origin in natural terrain before enabling the menu.
- First-person off-hand rendering while driving remains to be checked on PC and touch.
- ADR 0261 also describes a mob radar. Radar implementation is tracked separately.
