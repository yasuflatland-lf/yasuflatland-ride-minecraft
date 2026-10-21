# 0104. Refuse a press on a taken seat

- Status: Accepted
- Date: 2026-10-21
- Extends: 0097

## Context

0097 lets a player hold camping gear and press a dinette deck seat to put the item on the slot under it. When that slot is taken, or does not accept the item (the hanging planter takes only the ceiling hook), the press falls back to the free accepting slot nearest the seat, as a press on a furniture or decor block does.

In the play test after 0103 (#410), repeated presses on one dinette seat that already held an item filled the table, the dashboard, and the other free spots one by one. The seat is a single spot the player points at, so the player could not tell where the items went. The owner decided that such a press does nothing.

## Decision

- A press names one slot when it comes from a dinette deck seat. `PlaceDecorCommand.exact` is `true` for a seat press and `false` for a press on a furniture or decor block
- With `exact`, the item goes on the pressed slot when that slot accepts it and is free. Otherwise nothing is placed: the player sees "No free spot for this item", keeps the item, and nothing is saved
- Without `exact`, 0097's rule stays: the pressed slot when it accepts the item and is free, otherwise the free accepting slot nearest the hit point
- The seat press stays cancelled in both cases, so a refused press does not seat the player either. With an empty hand or any other item the player sits as before

## Consequences

- A dinette seat takes gear from a seat press only while it is free. To put a second item somewhere, the player presses that spot instead, so every item lands where the player pointed or nowhere
- A player who wants to sit on a seat that holds an item has to empty the hand first, as before
- Block presses keep the fallback. If players get lost there too, the same `exact` flag can be turned on for them
