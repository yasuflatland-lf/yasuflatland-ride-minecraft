# 0180. A wide bulldozer blade switched from the cab

- Status: Proposed; extended by [0181](0181-a-road-paver-on-the-bulldozer.md) (Proposed)
- Date: 2026-10-29
- Extends: 0006 (ram box), 0050 (per-kind parameters), 0055 (`DriveStep`), 0122 (`footprint`), 0136 (bulldozer), 0138 (blade lift), 0139 (cab monitor), 0142 (placement), 0178 (the Building Tools group)

## Context

The owner approved a blade twice as wide as today's, switched from the cab independently of the blade lift. The [approved design](../designs/2026-10-29-wide-blade-road-paver-bunk-bed.md) records that session; this ADR records the implementation rules and the owner's later decision to keep the fittings at their original size.

The design asked for the label NORMAL; it needs 35 px against the bulldozer's 25 px label area (`tools/monitor.py` draws 6 px per glyph), so the label is NORM. The design estimated 9 to 10 columns; the touching-cell rule of 0136 gives 11.

The existing code provides these building blocks:

- `BULLDOZER_SPEC.blade`, `BULLDOZER_SPEC.bodyHalfWidth`, and `bladeColumns` in `src/domain/vehicle/kinds/bulldozer/` define the cut width, ram body width, and touching-cell selection (0136). The width is fixed today.
- `DriveStep` in `src/domain/vehicle/drive.ts`, `VehicleProfile.body` in `profile.ts`, and `RAM_QUERY_RADIUS` define the kind-neutral drive output and ram envelope (0006, 0050, 0055).
- `BULLDOZER_MONITOR` and `Drive.toolState` supply the blade switch's down/up screens (0138, 0139). After World Edit, `BULLDOZER_MONITOR.group` is `"yasu_build:building_tools"`, and `GROUPS` in `tools/gen_item_catalog.py` places `yasu_ride:blade_switch` there by its full ID (0178).
- `tools/gen_bulldozer.py` draws `blade` under `blade_rig`, using `BLADE_HALF` and `BLADE_TOP`; `bulldozer.rc.json` controls bone visibility. The drive animation moves `blade_rig` when the blade lifts.
- `VehicleProfile.footprint` and `isVehicleSpace` reserve space around a vehicle (0122); the bulldozer's footprint is 3.35, while placement clearance excludes the blade and tracks (0142).

## Decision

1. **Item (4/16).** Add `yasu_ride:wide_blade_switch`, en_US "Wide Blade", to `yasu_build:building_tools` right after `yasu_ride:blade_switch`. Write the full item ID in `tools/gen_item_catalog.py`. Its shapeless recipe uses a lever and two iron ingots and is always unlocked.
2. **State (5/16).** Add entity property `yasu_ride:wide_blade`, bool, default false, `client_sync` true because the client render controller reads it, and list it in the entity contract's `restored`. Spawn is normal. A rebuilt bulldozer resends it on its first step, like every bulldozer property (0127, 0136).
3. **Monitor (5/16).** Append `{ item: "wide_blade_switch", states: ["normal", "wide"] }` after the blade switch. The screens are DOWN 1, UP 2, NORM 3, WIDE 4.
4. **Model (3/16, 5/16).** The wide look is a second bone, `blade_wide`, a child of `blade_rig` with the same pivot as `blade` (`[0, 0, -37.8]` px). `tools/gen_bulldozer.py` builds both bones with one blade cube builder, `blade_cubes(half)`: `blade` from `BLADE_HALF` (37.05 px) and `blade_wide` from `2 * BLADE_HALF`.

   The owner decided that only the blade plate grows while the bolts and other fittings keep their size. The plate is the moldboard rows up to `BLADE_TOP`, the five cutting edge segments with their dark backing, the strip above the edge, and the two back box beams; they span the doubled half width (the plate reaches x ±74.1 px instead of ±37.05 px). The cutting-edge bolts keep their size and about the same pitch (each segment still gets `max(2, round(length / 2.2))` bolts), so their count doubles from 33 to 66. The end plates keep their size and move out to the new ends. The back ribs keep their size and their 5.8 px pitch, and their count grows from 6 to 13 per side. This ADR counts the spill guard, the centre pivot bracket, and its disc as fittings, so they stay in the middle unchanged. The push frame and lift cylinders (the other `blade_rig` parts) do not change.

   `bulldozer.rc.json` shows exactly one of `blade` and `blade_wide` through `part_visibility`, driven by `query.property('yasu_ride:wide_blade')`. `blade_wide` is a child of `blade_rig`, so the drive animation raises and lowers it with no animation change. `visible_bounds_width` grows from 7 to 11 so the wide blade (x up to 74.1 px from the centre) is not culled. The README previews hide `blade_wide` and keep the normal blade. Step 3/16 builds `blade_cubes` with the pack output unchanged; 5/16 adds the bone.
5. **Cut (3/16, 6/16).** `BULLDOZER_WIDE_BLADE` is `BULLDOZER_SPEC.blade` with `halfWidth = 2 * BULLDOZER_SPEC.blade.halfWidth` (4.64), built from the normal rule in `spec.ts`, so the width is written once. Step 3/16 also derives `bodyHalfWidth` from `blade.halfWidth`. With the touching-cell rule of 0136 it cuts 11 columns at heading 0 from x 0.5 (normal: 5). Depth and every other blade rule are unchanged. Wide toggles while raised or lowered; it cuts only while lowered (0138).
6. **Ram (2/16, 6/16).** A drive may report `DriveStep.ramHalfWidth` per tick. `VehicleProfile.maxRamHalfWidth` caps it, the ram query radius covers the cap, and the core clamps the reported value to it (2/16). The bulldozer reports `ramHalfWidth = bladeRule().halfWidth` every tick, raised or lowered: 2.32 (equal to `body.halfWidth`) for the normal blade and 4.64 while wide is on. Its profile cap is `BULLDOZER_WIDE_BLADE.halfWidth` (6/16). `bladeRule()` is the only place that reads the wide flag; the cut, the ram, and the road width (13/16, [0181](0181-a-road-paver-on-the-bulldozer.md)) all read the rule it returns.
7. **Placement (5/16).** Placement footprint (3.35) and clearance stay as they are; the blade is model only for placement (0142). The static geo holds both bones, so the model tests treat `blade_wide` as model only. The model reach test leaves `blade_wide` out, and the normal blade still sets the 3.335 reach under the 3.35 footprint. The blade-front test excludes both `blade` and `blade_wide` from the "behind the blade front" check, and both have their lowest z at -38.4 px.
8. **Ownership and order (2/16, 3/16).** These refactors change no behavior and come first (0050). Step 3/16 makes the bulldozer tools table-driven, adds the `bladeRule()` hook, derives the body width from the blade width, extracts the shared `feetRow`, and extracts `blade_cubes`. Kind-neutral core, application, and infrastructure code never name or branch on a vehicle kind.

## Consequences

- `RAM_QUERY_RADIUS` is one value for all kinds, so once the bulldozer cap exists every kind's ram query reaches about `hypot(2.4 + t, 4.64 + t, dy)`.
- A wide ram hits mobs beside the tracks.
- The wide blade can poke into walls when the bulldozer is placed beside them.
- `footprint` (0122) no longer covers the whole model while the wide blade is shown. `isVehicleSpace` lets camping gear, tents, and placements into the wide blade's reach (up to about 5.22 blocks). This is accepted, because the blade is model only, as it already is for placement (0142).
- Open interpretation: this ADR counts the spill guard as a fitting, so it stays at its original width in the middle of the wide blade. If the owner reads it as part of the plate, an addendum widens it.
