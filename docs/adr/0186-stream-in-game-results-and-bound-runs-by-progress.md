# 0186. Stream in-game results and bound runs by progress

- Status: Proposed
- Date: 2026-10-30
- Extends: 0010, 0054

## Context

The in-game runner buffers every result until the run ends in `runner.ts`, while `scripts/game-test.mjs` gives up after a fixed five minutes. The suite declares 134 scenarios and 8,173 ticks, or 7,786 ticks without a connected player. A measured run takes 7,816 ticks, about 391 seconds at 20 TPS, so the fixed deadline reports a passing unsharded run as a failure. A malformed run request silently falls back to a manual whole run, and a run that `pnpm test:game` has given up on keeps the runner busy.

## Decision

Before setup, the runner logs `PLAN runs=<n> skipped=<m> unselected=<u> ticks=<sum of declared ticks of the runs> lanes=<K>`, followed by one `SKIP <name>: <reason>` line per skipped scenario. After setup, it logs `READY`.

When a scenario ends, the runner logs `PASS|FAIL <name> ticks=<n>[ lane=<k>] <detail>` and that scenario's extra lines in one synchronous loop. A fused course also logs `<name> step <step> PASS|FAIL <detail>` as each step ends. The run ends with `SUMMARY pass=<p> fail=<f> ticks=<elapsed> ms=<wall>[ error=<e>]`.

Reject a malformed request with an error SUMMARY under its own run id. The script event `yasu_ride:test_cancel <runId>` ends that run: it logs nothing more and releases the busy guard.

`pnpm test:game` prints lines as they arrive. Any new line of the run counts as progress, including PLAN, SKIP, READY, and step lines. The run is `overdue` when the time since PLAN exceeds `ceil(ticks / 20 * 1.5)` seconds plus a 30-second setup margin. It is `stalled` when no new line arrives for 60 seconds. On either condition, the command sends the cancel event and exits 1. Remove the fixed five-minute deadline.

A scenario declares at most 300 ticks. At 20 TPS this is a quarter of the 60-second stall window, so a scenario only looks stalled when TPS drops to about 5.

## Consequences

Adding scenarios no longer turns a passing run into a timeout merely because the suite exceeds a fixed deadline. A hung run fails within about a minute. After cancellation, `pnpm server:restart` is still the reliable recovery because a hung scenario's promise may still be running.
