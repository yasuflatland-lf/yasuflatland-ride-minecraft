# 0195. Cut the body height ahead of a grounded blade

- Status: Proposed
- Date: 2026-10-31
- Amends: [0136](0136-bulldozer.md) (a ground cut stops at the first air gap), [0137](0137-clear-block-columns-with-the-blade.md) (the ground run scan)

## Context

Issue #1015 reports that a grounded blade stopped at the first air gap, so an overhang with a gap under it stayed in the path and the body drove into it. ADR 0136 accepted that rule to leave overhangs high above a gap alone, but the body itself cannot pass through an overhang that is within its own height.

## Decision

A grounded blade first clears its whole body height through air gaps, the same range a fixed cut clears in flight: from the feet row to `ceil(y + bodyHeight)`. Past that height the ground run continues as before, up through any unbroken run of non-air blocks, and stops at the first air gap. Overhangs above the body height and beyond a gap stay. The blade still never removes the floor below its feet, and kept blocks, liquids, and light blocks follow 0137 unchanged. Flight cuts are unchanged.

Each ground column carries this body height as its minimum height (`minHeight`), and the cut scan treats a gap below it as part of the run.

## Consequences

Driving into an overhang within body height clears it instead of stopping short. Overhangs above that height still remain. Manual PC and mobile checks stay pending with 0136.
