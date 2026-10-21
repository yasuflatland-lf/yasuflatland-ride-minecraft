# 0085. Halve the sports boat bow rise

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0061 (the 7-degree `maxTrim` kept from 0059)

## Context

0059 set the sports boat's bow to rise by up to 7 degrees while it gains speed, rising at 0.5 degrees per tick (about 0.7 s) and settling at 0.25 degrees per tick (about 1.4 s). 0061 kept those values after a live check in which 15 degrees was too much. After more driving, the owner asked for half the current bow rise.

## Decision

- `maxTrim` drops from 7 to 3.5 degrees, so `yasu_ride:trim` ranges from 0 to 3.5
- The rates halve with it, to 0.25 degrees per tick rising and 0.125 settling, so the bow still lifts in about 0.7 s and settles in about 1.4 s; only the angle changes
- The roll (0061, 0079) is unchanged

## Consequences

- Only the Behavior Pack changes: the Resource Pack animation reads `yasu_ride:trim` as it is, so it needs no new version (0015)
- If the bow now looks too flat, tune `maxTrim` between 3.5 and 7 and keep the rates at `maxTrim` / 14 and `maxTrim` / 28 to hold the timing
