# Paste input spike (issue 1131)

Which events reach the Build Wand for a short tap and a long press. The probe
is `src/test-pack/inputProbe.ts`, switched with `/scriptevent yasu_ride_test:probe on|off`.
It prints `[probe] <event> tick=<n> [isFirstEvent=<b>] block=<yes|no> sneak=<b>` to chat for the player holding the Build Wand.

## Owner-run steps (not run by an AI agent)

1. `pnpm build`, `pnpm server:restart`, join from the iPad, then repeat on PC.
2. Hold the Build Wand, finish a Copy so the wand is in the current paste aiming state, then run `/scriptevent yasu_ride_test:probe on`.
3. For each row below, do the action once, copy the chat lines, and note whether the block under the gaze broke.
4. Run `/scriptevent yasu_ride_test:probe off` and post the table as a comment on issue 1131.

## Event table

| Device | Action                                  | itemUse                    | startItemUse               | playerInteractWithBlock (isFirstEvent) | playerBreakBlock           | Block broke                |
| ------ | --------------------------------------- | -------------------------- | -------------------------- | -------------------------------------- | -------------------------- | -------------------------- |
| iPad   | short tap on a block                    | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| iPad   | long press on a block (about 1 s)       | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| iPad   | short tap on air                        | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| iPad   | long press on air (about 1 s)           | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| PC     | right click on a block                  | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| PC     | hold right click on a block (about 1 s) | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| PC     | right click on air                      | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |
| PC     | hold right click on air (about 1 s)     | pending device measurement | pending device measurement | pending device measurement             | pending device measurement | pending device measurement |

## Routing decision

Pending device measurement. Default: `itemUse` after the existing debounce for
a block under the gaze. Fallback 1: the `isFirstEvent` interact routed through
`PressPasteAim` with the shared debounce. Fallback 2: a cancelled
`playerBreakBlock`. If a short iPad block tap reaches the wand as `itemUse`,
mark the issue "owner decision needed" and stop the stack at 6/13 and later.
