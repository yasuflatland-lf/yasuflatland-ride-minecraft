# Camper hover display

- Scope: What the camper shows in hover form: the four glow discs under the folded wheels, the particles that leave them, and the emissive overlay that makes the discs bright.
- Verified at: fd83ec4e
- Source: [0022](../adr/0022-fold-wheels-and-glow-in-flight.md)
- Source: [0033](../adr/0033-lower-the-wheels-before-touchdown.md)
- Source: [0147](../adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md)
- Source: [0184](../adr/0184-light-the-camper-roof-and-tail-lamps.md)
- Source: [0190](../adr/0190-ribbed-camper-shell-atlas.md)
- Source: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md)
- Excluded: [0043](../adr/0043-wheel-arms.md): SUV wheel arms and fold-out offset; the camper has no arm bones and its folded-wheel animation has no x offset
- Excluded: [0192](../adr/0192-suv-detailed-body.md): replaces 0147 rows and lamp bones for the SUV only
- Excluded: [0193](../adr/0193-shared-texture-tooling.md): replaces the rationale for copying texture tooling into each generator, not a display rule (see Open issues)
- Excluded: [0199](../adr/0199-square-the-camper-front-and-fold-the-grille.md): camper front geometry and grille; the hover discs sit at the wheels, behind the changed front

## Rules

### Disc geometry

- Applies to: Camper, model `camper.geo.json`; visible only in hover form (see Disc visibility).
- Rule: Four bones `glow_fl`, `glow_fr`, `glow_rl`, `glow_rr` are children of `body`. Each is centered on the x and z of its `hover_*` locator and on the wheel axle of the same corner. A disc is 16 turned square cubes whose corner radius is `GLOW_RADIUS` (the wheel radius `WHEEL_R`), so it reads as a round disc under the folded wheel. Its top face is at y 0 and its bottom face is at `GLOW_BOTTOM`. The discs use the `glow` palette swatch and stay inside the camper footprint (`CAMPER_SPEC.footprint`).
- Agreement: Proposed
- Basis: [0190](../adr/0190-ribbed-camper-shell-atlas.md) Addendum: round camper hover glows, "Each disc uses 16 turned squares with corner radius `WHEEL_R` (7.8 px) and spans y = -0.5 to 0, below the folded wheel."; [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md) Decision, "Derive this height and the discs' depth from the same `GLOW_BOTTOM` constant."
- Implementation: `tools/gen_camper.py` (`GLOW_RADIUS`, `GLOW_SEGMENTS`, `GLOW_BOTTOM`, `disc`, `glows`); `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camperGlow.test.ts` "centers round discs at the hover locators below folded camper wheels" (cube count, y extent -0.5 to 0, radius against the wheel pivot, footprint); `tests/packs/camper.test.ts` "puts wheel pivots at the axle centers and hover locators directly below after mirroring". Estimate-free geometry checks only. Not verified: how the discs look in game (owner check required by 0190, none recorded).

### Locators on the lower faces

- Applies to: Camper, `hover_fl`, `hover_fr`, `hover_rl`, `hover_rr`, on the `body` bone.
- Rule: Each `hover_*` locator keeps the x and z of its disc and sits at y `GLOW_BOTTOM`, on the disc's lower face, so every locator is at or below the lower face of every disc cube. The locators stay on `body`.
- Agreement: Proposed
- Basis: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md) Decision, "Place the camper's four `hover_*` locators at y = -0.5, on the discs' lower faces, keeping their x and z coordinates and their `body` parent."
- Implementation: `tools/gen_camper.py` (`hover`, `GLOW_BOTTOM`); `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json` (`body` locators)
- Verification: `tests/packs/camperGlow.test.ts` "centers round discs at the hover locators below folded camper wheels" (locator y -0.5 is an acceptance value there, and at or below every cube's lower face); `tests/packs/camper.test.ts` "puts wheel pivots at the axle centers and hover locators directly below after mirroring". Not verified: particle visibility from the chase camera, while banking, and from below (the acceptance condition of 0197).

### Hover particles

- Applies to: Camper in the `hover` state of `controller.animation.yasu_ride.camper.form`; not in `ground`, `deploy`, `retract`, or the submarine states.
- Rule: The camper plays `animation.yasu_ride.camper.hover_glow` only in the `hover` state. It emits the shared particle effect `hover_glow` at the four `hover_*` locators and nowhere else. The particle definition is the one the SUV uses; the camper adds no tuning of its own, so the emission rate, lifetime and motion are the values in `hover_glow.particle.json`, and the gate and repeat timing are the `hover` state entry in `camper.ac.json` and `animation_length` in `camper.anim.json`.
- Agreement: Proposed
- Basis: [0022](../adr/0022-fold-wheels-and-glow-in-flight.md) Decision, "The particle `mycar:hover_glow` drifts down from each `hover_*` locator in the `hover` state"; [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md) Consequences, "Their effect, rate, lifetime, motion, and animation gate remain unchanged, as does the shared particle used by the SUV."
- Implementation: `packs/yasu_ride_rp/animation_controllers/yasu_ride/camper.ac.json` (`hover` state); `packs/yasu_ride_rp/animations/yasu_ride/camper.anim.json` (`animation.yasu_ride.camper.hover_glow`); `packs/yasu_ride_rp/entity/yasu_ride/camper.ce.json` (`particle_effects.hover_glow`); `packs/yasu_ride_rp/particles/yasu_ride/hover_glow.particle.json`
- Verification: `tests/packs/camper.test.ts` "emits hover glow at all four locators present in the model" (effect name and the four locators). `tests/packs/camper.test.ts` also compares the whole camper form controller with the SUV one (`camperForm` equals `suvForm`), which covers the `hover` state entry. No camper test pins the particle values. Not verified: that the particles are visible in game from any camera position (0197 acceptance condition, #1035).

### Disc visibility

- Applies to: Camper, all forms; the discs show only while the landing gear flag `yasu_ride:gear_down` is false.
- Rule: The base render controller `controller.render.yasu_ride.camper` always hides `glow_*`. The discs are drawn only by the separate render controller `controller.render.yasu_ride.camper.glow`, which the client entity enables with the condition `!query.property('yasu_ride:gear_down')`. That controller hides every bone except `glow_*` and draws with `Texture.lit` and `Material.lamp_lit` (`entity_emissive`). The condition does not read `yasu_ride:headlights` or `yasu_ride:ceiling_lights`, and the `.lit` lamp pass does not draw the discs. The gear flag comes down before touchdown (`CAMPER_SPEC.gearDownHeight`), so the discs disappear when the wheels start to unfold.
- Agreement: Proposed
- Basis: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md) Addendum: PBR camper hover glow, "Hide `glow_*` in the base pass to avoid double drawing."; [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md) Addendum: PBR camper hover glow, "This keeps the discs hidden with the gear down and independent of both lamp switches; the existing `.lit` lamp pass keeps its rules."; [0033](../adr/0033-lower-the-wheels-before-touchdown.md) Decision, "The render controller shows the `glow_*` discs only while the gear is up, so they do not hang under the unfolding wheels."
- Implementation: `packs/yasu_ride_rp/render_controllers/yasu_ride/camper.rc.json`; `packs/yasu_ride_rp/entity/yasu_ride/camper.ce.json` (`render_controllers`, `materials.lamp_lit`, `textures.lit`); `src/domain/vehicle/kinds/camper/spec.ts` (`CAMPER_SPEC.gearDownHeight`)
- Verification: `tests/packs/camperGlow.test.ts` "draws only the flight discs in their own emissive overlay independently of the lamps" (render controller list, conditions, part visibility). Not verified: in game with the gear down, in hover with lamps off and on, or on a Vibrant Visuals device (0197 requires an owner check; none recorded).

### Lit slots and emissive values

- Applies to: Camper textures `camper_lit.png`, `camper_lit_mer.png`, `camper_lit.texture_set.json`, and the 16 paint atlases; Vibrant Visuals clients use the MER layer, other clients use the lit alpha mask.
- Rule: The `glow` palette swatch is in the camper's lit slots (`LIT_SLOTS`) beside the lamp swatches `lens`, `dome`, `marker_amber` and `marker_red`. It keeps its palette index, UVs and RGB, and its paint-atlas alpha stays the partial alpha (acceptance value 40, checked by the tests below), though the discs are drawn from the lit atlas only. In the lit atlas its alpha is 0 for the legacy full-bright material; in the MER atlas it takes the lit MER value (0, 255, 255, 255) as the lamps do, and every other MER texel stays (0, 0, 255, 255). The paint atlases gain no emissive texture set. No light block is placed for the discs.
- Agreement: Proposed
- Basis: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md) Addendum: PBR camper hover glow, "Add the existing `glow` swatch to the camper's lit slots alongside `lens`, `dome`, `marker_amber`, and `marker_red`."; [0147](../adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md) Decision, "MER uses RGB `(0, 255, 255)` for lit swatches and `(0, 0, 255)` elsewhere, with alpha 255 throughout: metalness 0, emissivity at its maximum 255 only on lamps, and roughness 255."; [0184](../adr/0184-light-the-camper-roof-and-tail-lamps.md) Decision, "Add the new swatches to the camper's `LIT_SLOTS` alongside `lens` and `dome`, and put their cubes in the existing `headlights` bone so the existing `.lit` render controller and `yasu_ride:headlights` switch cover them."; [0022](../adr/0022-fold-wheels-and-glow-in-flight.md) Consequences, "The ground under a flying car is not actually lit; the discs and particles only look bright"
- Implementation: `tools/gen_camper.py` (`PALETTE["glow"]`, `LAMP_GROUPS`, `LIT_SLOTS`, `build_lit_textures`); `packs/yasu_ride_rp/textures/entity/yasu_ride/camper_lit.png`; `packs/yasu_ride_rp/textures/entity/yasu_ride/camper_lit_mer.png`; `packs/yasu_ride_rp/textures/entity/yasu_ride/camper_lit.texture_set.json`
- Verification: `tests/packs/camperGlow.test.ts` "keeps the paint glow swatch and UVs unchanged and makes its lit texel fully emissive" (UV, paint alpha, lit alpha, MER value, all paints); `tests/packs/camper.test.ts` "keeps glass transparent and limits emissive alpha to lamps and glows in every paint". These check the asset pixels only. Not verified: rendering on a Vibrant Visuals device or on a legacy client, and that the discs do not light nearby blocks (no test asserts the absence). Owner check of the roof and tail lamps in the same atlas is manual-test row L10, whose result cells are empty.

## Open issues

- No part of the camper hover display is verified by the owner in game; only asset-data tests pass. The 0147 lamp glow check covers lamps, not discs or particles.
- 0190 addendum and 0197 disagree on how the discs are drawn: 0190 says only `glow_*` uses `entity_emissive_alpha` and the main render controller shows the discs when `yasu_ride:gear_down` is false; 0197 hides them in the base pass and draws them in a `.glow` overlay with `entity_emissive` and lit alpha 0. The code follows 0197 (`camper.rc.json`, `camper.ce.json` define no `entity_emissive_alpha` material). 0197 is recorded as "Supersedes in part: 0190: hover glow addendum" but its text amends only the locator instruction and adds the overlay, so which sentences of the addendum still apply is not stated: `docs/adr/0197-emit-camper-hover-particles-below-the-discs.md`, `docs/adr/0190-ribbed-camper-shell-atlas.md`.
- Both ADRs holding the hover display decisions are Proposed. 0190's acceptance condition is "owner decision pending (see #1193)" and covers the whole ribbed shell, not the addendum; 0197 waits for a client check (#1035). No rule in this spec can be Accepted until an owner decision is recorded: `docs/adr/0190-ribbed-camper-shell-atlas.md`, `docs/adr/0197-emit-camper-hover-particles-below-the-discs.md`.
- No manual-test row checks the camper hover discs or their particles, although 0190 and 0197 both require an owner check in game (chase camera, banking, from below, lamps off and on, gear down): `docs/manual-test.md`.
- 0147 says the owner confirmed the lamp glow on a Vibrant Visuals device on 2026-10-26 using checks L1-L8, but the "Light glow (Vibrant Visuals)" section of the manual test says "Device verification is pending (ADR 0147)" and its result cells hold `[]` with no revision or device: `docs/adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md`, `docs/manual-test.md`.
- 0147 Decision says each generator declares `EMISSIVE_LIT`, `MER_LIT`, `MER_OFF` and `LIT_SLOTS` locally because isolated Python execution prevents a shared helper; `tools/gen_camper.py` imports `texture_io` and `lit_textures` through `load_tool` and calls `build_lit_textures`. Proposed ADR 0193 amends that rationale: `docs/adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md`, `docs/adr/0193-shared-texture-tooling.md`, `tools/gen_camper.py`.
- 0022 names the entity property and particle with the old `mycar:` namespace (`mycar:flight`, `mycar:hover_glow`); the code uses `yasu_ride:gear_down` and `yasu_ride:hover_glow`: `docs/adr/0022-fold-wheels-and-glow-in-flight.md`, `packs/yasu_ride_rp/entity/yasu_ride/camper.ce.json`.
