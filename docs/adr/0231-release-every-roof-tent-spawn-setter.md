# 0231. Release every roof tent spawn setter

- Status: Proposed
- Acceptance condition: issue #1382 is implemented and reviewed
- Date: 2026-11-06
- Extends: [0200](0200-roof-tent-as-a-host-bound-camp-entity.md): removal releases every recorded spawn setter

## Context

A roof tent can be used by several players over its lifetime. Recording only the
latest sleeper leaves earlier players with respawn points in a removed shelter.
For review item R25, the owner chose to release every player who set a respawn
point there, while preserving any later spawn point set at another bed.

## Decision

Record a set of player IDs after overworld roof tent sleep requests, including
daytime requests that set spawn but do not sleep. Ignore duplicate IDs. Preserve
the existing order: delegate to `SleepInBed` before recording the setter.

Persist the set as a JSON string array in `yasu_ride:roof_tent_spawn_setters`.
Read the set as the union of a valid array and the legacy single ID in
`yasu_ride:roof_tent_spawn_set_by`, so a tent with only the legacy key is a set of
one, and a malformed array leaves only the legacy ID. The legacy ID is merged
rather than used only as a fallback because an older pack may have written a
newer sleeper there without touching the array. On each addition, also write the legacy key with that player ID
so older packs still see the latest sleeper. Clearing removes both properties.
Keep the set in the removal snapshot so cleanup works after entity loss.

On removal, request `BedWorld.clearSpawnPoint` for every recorded setter with
the tent's dimension and cell. Isolate each request with the shared application
helper and log a warning on failure, then clear the setter collection. Keep the
existing bed port: its compare-before-clear rule preserves later spawn points
elsewhere, and offline or unavailable players remain a no-op.

## Consequences

Removal attempts cleanup for all known setters even if one request throws.
The saved array grows with distinct sleepers during the tent's lifetime.
Older packs see only the latest sleeper, and historical setters already lost by
older packs cannot be recovered. Offline players still cannot be cleared, and
failed requests are not retried after the tent is removed. Revisit persistent
pending cleanup if offline release becomes a requirement. Application property
tests cover arbitrary setter collections and overwritten spawns; adapter tests
cover saved formats, legacy compatibility, and clearing. Live respawn behavior
remains unverified.
