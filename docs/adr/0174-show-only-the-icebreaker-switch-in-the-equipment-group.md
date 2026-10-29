# 0174. Show only the Icebreaker Switch in the equipment group

- Status: Proposed
- Date: 2026-10-29
- Supersedes in part: [0171](0171-sports-boat-equipment-and-icebreaker-mode.md) (Decision 1: the group's items and icon; Decision 2: the box is no longer a creative item)
- Extends: [0093](0093-decorate-the-parked-camper.md) (placement gifts)

## Context

The owner found the Sports Boat Equipment Box inside the Sports Boat Equipment group unnecessary and wants only the icebreaker mode item left there.

The box shipped in v0.28.0, so players may hold it. The placement gift system has no direct-give mode: a held switch would be opened as a gift. Removing the box identifier would turn held boxes into unknown items, so the box is hidden from the creative menu instead of deleted.

## Decision

1. **One item in the group.** The creative group `yasu_ride:sportsboat_equipment` holds only `icebreaker_switch` and uses it as its icon. Its name and its position directly after `bulldozer_switches` do not change.
2. **Hidden box.** `sportsboat_equipment_box` keeps its identifier, its gift role, its lore line, its received flag and its recipe-less status, but its `menu_category` becomes `none`. It is not listed in the creative grid or in search; `/give` still works and a held box still draws its helm icon and name.
3. **No gift-system change.** `PLACEMENT_GIFTS`, `OpenGift`, the sports boat profile, the cab monitor and every lang and texture file stay as they are. The Resource Pack does not change.

## Consequences

A new player still receives a hidden item that the creative menu cannot show. Revisit giving the switch directly if the box proves confusing; that needs a direct-give mode in the placement gift system and a migration for boxes already held.

Item changes do not reload with `/reload`, so a device check on a restarted server is needed (0015).
