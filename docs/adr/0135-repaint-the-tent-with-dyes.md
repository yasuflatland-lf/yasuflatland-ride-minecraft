# 0135. Repaint the tent with dyes

- Status: Proposed (to be Accepted once the checks under Tent paint in [manual-test.md](../manual-test.md) pass)
- Date: 2026-10-23
- Extends: [0031](0031-repaint-with-all-sixteen-dyes.md) (sixteen paints in a fixed variant order), 0036 (a dye hit paints instead of counting), 0037 (one dye per repaint within a tick), [0076](0076-per-kind-default-paint.md) (variant 0 shows the default paint), [0131](0131-pitch-a-tent-in-the-camp.md) (the tent's hit paths)

## Context

The vehicles take one of sixteen paints from a dye hit, but a pitched tent always
showed the tan-brown fly of 0130. The tent's texture already keeps the fly in two
swatches of its own (slot 0 `fly` and slot 1 `fly_dark`), and its entity already
stores `minecraft:variant` 0, so it can follow the vehicles' paint contract without a
new mechanism. The shared `Repaint` use case already holds the same-color,
same-tick, and Creative rules.

## Decision

- The `PAINTS` order now also binds the tent: its 16 `yasu_ride:paint_<paint>`
  component groups and events set `minecraft:variant` to the paint's index, and
  `tent.rc.json` picks `Array.paints[query.variant]` from 16 textures in that order.
  New paints still go at the end.
- The tent's variant 0 shows the tan-brown fly (`TENT_SPEC.defaultPaint` is `khaki`),
  so brown dye restores it, as it restores khaki on the vehicles (0076).
- Only the fly group is recolored: the bones `fly`, `flap_front`, `flap_left`, and
  `flap_right`, which alone use texture slots 0 and 1. `tools/gen_tent.py` writes
  `tent.png` unchanged for khaki and `tent_<paint>.png` for the others, setting slot 0
  to the paint's base color and slot 1 to it scaled by 136/176. The inner tent, the
  bedroom flap, the poles, the strap, the lantern (including its alpha-0 glass slot),
  and the mattresses keep their colors. The generator refuses a cube outside the fly
  group that uses slot 0 or 1.
- A dye hit is routed at the top of the tent handler's `hitTent`, which all three hit
  paths reach (a block hit, a Creative break deferred with `system.run`, and a hit on
  the entity), after the shared per-tick swing check and before `TakeDownTent`. So a
  dye hit never counts toward taking the tent down, and it repaints even while
  someone is inside, with no "someone is inside" message. `PaintTent` wraps one
  `Repaint<TentId>` for the session.
- The tent item stays single-color: a painted tent taken down returns the plain
  `yasu_ride:tent_item`, as a painted vehicle returns its plain item (0031).

## Consequences

- Repainting a tent costs one dye outside Creative, and a dye of the color it already
  shows is kept, exactly as for the vehicles.
- The Resource Pack carries 15 more 16 x 16 textures.
- The tent gets no paint hint; the hint of 0086 stays vehicle-only.
- The color is lost when the tent is taken down. Revisit this if players want painted
  tent items, which would need a variant on the item or one item per paint.
