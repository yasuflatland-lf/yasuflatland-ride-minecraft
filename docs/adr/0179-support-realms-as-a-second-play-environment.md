# 0179. Support Realms as a second play environment

- Status: Proposed
- Date: 2026-10-23
- Extends: 0001

## Context

0001 names one play environment: a Bedrock Dedicated Server (BDS) on a home LAN. Players also want to use the add-on on a Realm, where there is no server folder to copy packs into and no console.

What the add-on depends on today:

- The Behavior Pack's only script dependency is the stable `@minecraft/server` (2.2.0 in the manifest), and no experiment has to be on (0001)
- Nothing under `src/` imports `@minecraft/server-admin`, `@minecraft/server-net`, or another module that only a dedicated server provides, and the scripts run no console commands
- The fleet and every other saved state live in world dynamic properties (0038, 0066), which travel with the world file
- `yasu_ride_test_bp` and the in-game tests started with `scriptevent` (0010) exist only for the dev BDS in Docker (0015)

So no code is known to need a change. What differs is how the packs reach the world, how they are updated, and how much server capacity the scripts get. None of this has been measured on a Realm yet.

## Decision

- Treat a Realm as a supported play environment beside the home LAN BDS. Keep every rule of 0001: stable APIs only, no experiments
- Do not add a dependency on a module or a command that a Realm lacks. A change that needs one adds an ADR that says how Realms are affected
- Install on a Realm by applying `yasu_ride_bp` and `yasu_ride_rp` (never `yasu_ride_test_bp`) to a world on a device and uploading that world to the Realm, as described in [docs/installing-on-a-realm.md](../installing-on-a-realm.md)
- Accept this ADR after one manual pass on a Realm with the checks in that guide: placing and breaking each kind, boarding and leaving, a passenger moving up to drive, the fleet limit surviving a Realm restart, headlights at night, the SUV and the camper changing form, and the sports boat on water. Record the date and the client versions here when it passes

## Consequences

- Players on a Realm get the same rides with no build or code change
- Updating the add-on on a Realm means uploading the world again. Forgetting to bump the Resource Pack version leaves devices on their cached copy, as on the BDS (0015)
- The in-game tests cannot run on a Realm, so Realm behavior is checked by hand only
- A Realm may give the scripts less capacity than the home BDS. Every moving vehicle sets its velocity each tick (0002) and may rewrite up to four headlight blocks each tick (0020). If many vehicles cause script watchdog warnings or stutter on a Realm, measure there and revisit the per-tick work
- Revisit this ADR if Realms stop accepting uploaded worlds with custom packs, or if a needed stable API turns out to be unavailable on Realms
