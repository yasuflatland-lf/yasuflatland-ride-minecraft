# 0103. Raise the camper wall cabinet to the ceiling

- Status: Accepted (the cabinet's 7 px height and its having no decor slot are superseded by [0114](0114-open-the-camper-wall-cabinet.md): it reaches down to model y 50 and holds two items behind each of its two doors; extended by [0113](0113-a-window-over-the-camper-counter.md))
- Date: 2026-10-21
- Supersedes in part: 0093 (the wall cabinet slots, and dropping a saved entry with an unknown slot on load), 0097 (the wall cabinet halves among the standing slots)

## Context

0093 put the wall cabinet over the counter in layer 2 (model y 38 to 45) with two decor slots on top, `wall_cabinet_front` and `wall_cabinet_rear`, at height 13. The owner asked to raise it by one block, so that its top meets the ceiling (#410). Up there, nothing fits on top of it.

A camper saved before this change may hold items in those two slots. 0093 drops a saved entry with an unknown slot on load, so those items would vanish without a word.

## Decision

- The wall cabinet is 7 px high with its top at the ceiling (`CEIL`, model y 61): from 54 to 61, with its doors from 54.5 to 60.5
- It has no decor slot. The camper has 10: `dashboard_center`, `dashboard_left`, `table`, `dinette_front`, `dinette_rear`, `shelf_low`, `shelf_high`, `stove`, `counter`, and `ceiling_hook`. A standing item fits the first 9. The cells (-1, -1, 2) and (-1, -2, 2) become cargo cells
- When a camper is rebuilt, each saved entry whose slot no longer exists, in saved order, moves to the first slot in slot order that takes its item and is free. If none is free, the entry stays saved, unchanged, as stowed decor. It is not laid, no press reaches it, and breaking the camper gives it back with the rest of the decor
- This replaces 0093's "on load, an entry with an unknown slot ... is dropped" and the wall cabinet rows of 0093's slot table, and removes both wall cabinet halves from 0097's standing slots

## Consequences

- The departure check reads 49 cargo cells, 10 slot cells, and 2 exit cells: still 61 cells in one batch, and the room's park check still reads 168 cells
- An item from a removed slot shows up on another spot, usually the dashboard, the first standing slot. A stowed item shows only after the camper is broken
- Moving entries needs no save. The next decor change saves the moved entries under their new slots
- The camper model changes, so the Resource Pack version goes up (0015)
- If a later change removes slots again, the same rule moves their items
