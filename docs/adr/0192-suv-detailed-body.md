# 0192. Detail the SUV body, dashboard and lamps

- Status: Proposed
- Date: 2026-10-30
- Extends: [0009](0009-vehicle-model-conventions.md) (bone contract)
- Amends in part: [0020](0020-headlights.md), [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md) (lamp geometry, bones, extraction, the SUV table row and the tail/brake exclusion), [0031](0031-repaint-with-all-sixteen-dyes.md) (texture dimensions and paint-dependent regions), [0170](0170-measure-suv-side-view-proportions.md) (frozen palette and atlas)

## Context

Issue #976 starts the SUV detail series. Today `tools/gen_model.py` generates a 128 x 16 palette atlas with one row of 4 x 4 swatch cells; every face samples the centre 2 x 2 of one cell and reads as a flat colour. The headlights are stepped rings of 1 x 1 cubes. The tail lights are flat red slabs that never glow. The dashboard is a plain slab with a small gauge panel and a body-coloured passenger panel. The owner plays with Vibrant Visuals (VV) on PC and mobile and wants the parked SUV to read as painted steel when standing next to it.

The reference photos are owner-local files and are not committed:

- `~/Downloads/suv_panel_material.png`
- `~/Downloads/suv_frontlight.png`
- `~/Downloads/suv_light_detail.png`
- `~/Downloads/suv_backlight.png`
- `~/Downloads/suv_console_meters.png`

The owner's local design document, `docs/superpowers/specs/2026-10-30-suv-detailed-body-design.md`, lists "no change to the bone contract" as a non-goal. The owner's later request for glowing tail lamps and the round headlight design require two new bones, so this ADR explicitly goes beyond that non-goal. Accepted Decisions must not be rewritten; this proposal records the redesign and its approval condition before feature PRs land.

## Decision

The owner approved the following design points on 2026-10-30; the bone contract extension has the explicit merge approval condition in rule 9.

1. **Atlas.** Keep the existing swatch row, with every existing index and UV unchanged because tests pin the lit slots (0184). Add rectangular detail regions below it as the camper did (0190). The atlas tool is a shared generalisation of `tools/camper_atlas.py`, not a copy. The shared tooling decision belongs to ADR 0193 in part 2 of the SUV detail series (#977), outside this ADR's scope. Start the body at 4 texels per model pixel before `SIZE_SCALE`. The headlight lens is at least 32 x 32 texels. Start the SUV texture at 512 x 256, with a 512 x 512 cap.

2. **PBR paint.** Give each of the 16 paints its own MER texture and texture set, following the sports boat (0163, 0166). Show metallic flake through small brightness jitter in the colour texture and jitter in MER metalness and roughness. Keep the paint colours (0031). Paint MER emissive is 0 on every texel except the `glow` swatch. A static paint texture set must not make lamps emit while they are off (0147); lamps glow only through the lit pass, using `suv_lit` and `suv_lit_mer`.

3. **Painted steel scope.** Only faces whose swatch is `body` today receive panel lines, flake and glossy metallic MER: body sides, doors, fenders, hood, tailgate and body-coloured pillars. The cowl is a `trim` cube today and stays trim. Give the black hardtop a matte, finely grained MER. Faces thinner than 1 model pixel in either direction, including grille bars and thin trim, receive no flake to avoid shimmer.

4. **Dashboard.** Make the whole dashboard matte black grained plastic in every paint, including today's body-coloured passenger panel (`passenger_dash`). Replace the glovebox lid with the tray and grab handle from the photo, and keep the windshield latch. Dash detail uses one shared set of regions, not one per paint. Keep the SUV right-hand drive (0069).

5. **Tail lamps.** Keep the photo's elements: a red housing with a frame, two horizontal rows of LED bars, a clear reverse lamp in the middle, and a black resin block on the outer side. Use the outline and proportions set in part 14 of the SUV detail series (#989); the tail lamp must not copy the Wrangler JL lamp. While the headlights are on, the red LED bars and the high-mounted third brake light glow red, and the reverse lamp glows white, through the same lit pass as the headlights. This decision narrows 0147's tail/brake exclusion for these SUV tail lamp parts without rewriting it; turn signals, hover glow discs and the monitor remain outside. There is no separate brake or reverse state. The owner requested on 2026-10-30: "when the headlights are on, the brake lamps also glow red".

6. **Gauges.** Dial faces carry tick marks and unreadable marks only, with no numerals. Needles are drawn into the texture and do not move.

7. **Panel-line relief.** An in-game test in part 12 of the SUV detail series (#987) decides whether the texture sets carry a `heightmap` or a `normal` map. Bedrock `texture_set` 1.16.100 accepts one of the two at the colour texture's resolution. That part records the test result back in this ADR.

   Status of point 7: Part 12 ships both variants behind `RELIEF_KIND` in `tools/suv_material.py`, with heightmap as the default. The final choice and its reason are pending the owner's in-game comparison.

8. **Round headlight.** The lens is one flat face on the `headlights` bone, with a high-resolution circular texture; the whole lens glows softly when lit. A body-coloured bezel panel in front of the lens supplies the round outline. Put the panel on a new `headlight_bezels` bone using a new `lamp_cutout` material (`entity_alphatest`), with texture alpha 0 inside the circle. A separate bone is necessary because the SUV default material, `entity_emissive_alpha`, reads alpha 0 as glow and cannot cut holes. If the in-game test in part 13 of the SUV detail series (#988) forces a different stable material, that part updates this ADR.

9. **Bone contract extension.** Extend 0009 with `tail_lights` for the lit tail lamp parts and the third brake light, and `headlight_bezels` for the cutout panels. Existing bone names do not change. These two new bones explicitly go beyond the design document's "no change to the bone contract" non-goal: the owner's later tail lamp request in rule 5 and the round lamp in rule 8 cannot be built without them. The PR description must quote this rule and ask the owner to approve the extension. **Merging this ADR's PR is the owner's approval of the bone contract extension.** If the owner declines, stop the series and ask.

10. **Lamp bones by part.** Assign lamp cubes to bones by the part that builds them, not by colour. `headlights` keeps the headlight lenses, fog lamp lenses and front lamp strip on the fender flares (today's `light` cubes). Rule 9 assigns the lit tail lamp parts and third brake light to `tail_lights`; rule 8 assigns the bezel panels to `headlight_bezels`.

    The replacement SUV row for 0147's per-kind table uses lit detail regions in `suv_lit` / `suv_lit_mer`, rather than whole swatches, because extraction is by part, not colour. `headlight_bezels` stays in the base pass and is not an overlay bone.

    | Kind | Lit parts | Overlay bones | Switch |
    |---|---|---|---|
    | SUV | Headlight lenses, fog lamp lenses and front lamp strip (today's `light` swatch), plus red LED bars, third brake light and white reverse lamp | `headlights`, `tail_lights` | `yasu_ride:headlights` for both |

11. **Generator structure.** Split the SUV generator into cohesive `tools/suv_*.py` modules in part 4 of the SUV detail series (#979). Each feature PR edits only the module that owns its part. Per-face texture maps must survive mirroring and the 180 degree turn: a mark drawn near the rear of a region must show at the rear of the vehicle on both sides. Part 9 of the SUV detail series (#984) establishes this mapping.

### Atlas layout (9/17)

The 512 x 256 atlas keeps swatches at y 0–3 and allocates blocks in this order:

| Block | x | y | Width | Height |
|---|---|---|---|---|
| body | 0 | 8 | 512 | 160 |
| headlight | 0 | 168 | 96 | 88 |
| tail_lamp | 96 | 168 | 96 | 88 |
| dash | 192 | 168 | 128 | 88 |
| gauges | 320 | 168 | 128 | 88 |
| spare | 448 | 168 | 64 | 88 |

On overflow, first lower the largest flat faces from 4 to at least 2 texels per
model pixel before `SIZE_SCALE`. If still full, claim `spare` (first PR merged)
or raise the height to 512 and add `<block>_ext` in the next free 64-row band
below y 256. Never move another block; record extension numbers here.

### Anti-goals

- No logos or legible lettering anywhere, including the wheel, dash, lamps, radio, gauges and switches.
- The grille keeps 8 slots.
- Flake and panel lines must not produce moire or shimmering bands at chase-camera distance; lower the contrast before lowering the resolution.
- Everything must still read from the colour texture alone with VV off.
- Paints must not turn into chrome mirrors or lose their hue.

## Consequences

This proposal amends 0009's bone contract; 0020 and 0147's cube-built lamps, sole SUV lamp bone `headlights`, and extraction by colour; 0147's SUV table row and tail/brake exclusion; 0031's texture size and statement that only the body swatch differs between paints; and 0170's frozen palette and atlas. Detail regions on painted panels are computed from each paint's body colour. Existing swatch indices and UVs stay compatible, following 0184, while rectangular detail regions follow 0190. The existing ADRs gain only a proposed amendment link; their Decisions remain historical records.

Part 17 of the SUV detail series (#992) changes the amendment links from "Amended in part" to "Superseded in part" when this ADR is accepted. Part 12 of the SUV detail series (#987) writes its relief-map test result back here, and part 13 of the SUV detail series (#988) writes its headlight material test result back here, including any replacement stable material. Neither result is established by this proposal.

Larger colour textures and 16 MER textures, with one texture set per paint, increase pack size and texture memory. Shared dash regions and the 512 x 512 cap limit that cost. Detailed paint and soft lamp glow improve the close parked view, but fine flake and panel lines can alias at chase-camera distance, especially on mobile. Revisit contrast first if moire or shimmering bands appear, then resolution if needed. Revisit the MER treatment if paints lose their hue or become chrome mirrors, and the colour detail if the VV-off appearance stops reading clearly. A stable material failing in part 13 of the SUV detail series (#988) requires revisiting the bezel material and recording the tested alternative here.

The new bone contract requires downstream generators, render controllers and model checks to recognise both names. If the owner declines the extension, the series stops and asks for direction before proceeding. This issue changes documentation only; code, packs, tests and the separate shared texture tooling ADR 0193 are outside its scope.

## Addendum: windshield lower rail (#1022)

The lower windshield rail uses `WINDSHIELD_RAIL_HEIGHT = 0.3` construction
pixels, matching the hood sheet thickness instead of the previous 1 px band.
The sealed windshield starts at `HOOD_TOP_Y + WINDSHIELD_RAIL_HEIGHT` (19.3 px)
and shares the rail's pivot and rake, so their adjoining faces leave no gap.
The sloping rail is not coplanar with the horizontal hood; its front top corner
is about 0.533 px above `HOOD_TOP_Y`, down from 1.106 px. This is the initial
thin-rail choice; driver-seat appearance and absence of z-fighting still need
the owner's in-game check. The A-pillars, front door posts, roof, seats and
collision dimensions stay unchanged. Resource Pack header/module and Behavior
Pack dependency advance to 0.1.215 for client cache invalidation (0015).
