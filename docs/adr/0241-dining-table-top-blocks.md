# 0241. Dining Table top blocks

- Status: Proposed
- Acceptance condition: review of issue #1469 and in-game verification of table stability, recovery, and mobile block placement
- Date: 2026-11-09
- Supersedes in part: [0240](0240-resort-furniture-family.md): Dining Table hosted-item clearance base
- Extends: [0240](0240-resort-furniture-family.md): tabletop block lifecycle and physics

## Context

The Dining Table now needs a solid block in its occupied cell. Its existing
entity physics would overlap that block, and its hosted-item clearance check
starts in the same cell. Leaving those settings unchanged risks displacing the
table and refuses lantern and oven placement because the cell is no longer air.

## Decision

Lay `yasu_ride:dining_table_top` with a hidden existing geometry, a full-cell
footprint, and collision and selection height equal to the 12 px tabletop.
Disable collision and gravity on the Dining Table entity; the laid block
provides collision while the entity stays at the placed origin. Keep its custom
hit box. Other furniture physics stays unchanged.

Set the Dining Table surface's clearance base to one, so hosting checks begin
above the laid block while item placement still uses the 12 px top height.
Record successfully laid cells in `yasu_ride:top_cells`, restore missing blocks
every 20 ticks, and clear only recorded cells still holding the tabletop block.
Preserve unavailable cells for later cleanup. Guard owned blocks against Creative
breaks and route non-dye block hits through the furniture recovery counter.
Refuse recovery while hosted items or blocks above recorded or wanted cells remain.

## Consequences

The table remains fixed if its support is removed. Entity removal and recovery
must clean its block. In-game tests and mobile placement are pending; the authored
scenarios do not establish device behavior. Ordinary blocks occupy the next
integer cell, starting at 16 px, so they leave a 4 px gap above the 12 px model.
This does not meet the design's flush-block goal; changing model height is outside
this issue. Block-tap forwarding and mutual exclusion between hosted items and
ordinary blocks remain follow-up work.
