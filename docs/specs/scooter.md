# Scooter

- Scope: The scooter kind: its spec table and profile, collision box and entity contract, ground and water-surface driving, lean, steering and stand, flat-wheel flight, paint, headlights and item. The generated model, including the separate body, floor and stand areas, is covered by Model conventions and rendered previews; the riders' grip pose by Seats and driver selection.
- Verified at: 8ca71e8
- Source: [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md)
- Source: [0055](../adr/0055-kind-neutral-vehicle-core.md)
- Source: [0193](../adr/0193-shared-texture-tooling.md)
- Source: [0251](../adr/0251-add-the-scooter-kind.md)
- Source: [0252](../adr/0252-budget-client-entity-texture-memory.md)
- Excluded: [0083](../adr/0083-ram-targets-are-a-core-sensor.md): ram target selection; the scooter uses the shared core sensor with its profile body
- Excluded: [0087](../adr/0087-sports-boat-spec-table.md): the sports boat spec table; the scooter has its own table
- Excluded: [0009](../adr/0009-vehicle-model-conventions.md): model conventions; the scooter's bone contract is described in model-and-previews
- Excluded: [0040](../adr/0040-submarine.md): the shared submarine and water policy; the surface policy is described in flight-and-submarine
- Excluded: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): compound rotation assemblies; the scooter's registered assemblies are described in model-and-previews
- Excluded: [0250](../adr/0250-scooter-rider-grip-pose-and-stepped-lean.md): the riders' pose and stepped lean; described in seats-and-driver

## Rules

The five scooter README previews include a running-board close-up; its framing is specified in [Scooter README previews](model-and-previews.md#scooter-readme-previews).

### Spec table, profile and seats

- Applies to: Scooter, driven entity `yasu_ride:scooter`, item `yasu_ride:scooter_item`.
- Rule: The frozen `SCOOTER_SPEC` owns the scooter's tuning: ground speeds (copies of the SUV's numbers, not imports), the collision envelope, seat positions, fleet limit, flight and surface values, bank, lean, steering and stand values. The shared pickers build `SCOOTER_MOTION`, `SCOOTER_TYRES`, and `SCOOTER_TRANSFORMING` with its air and water media. The profile body also reads the spec. The profile has two seats on the centre line, the driver at z -3.5/16 and the passenger behind at z -9.5/16, boarded in engine order. A fleet limit of 10 per player applies. Riders are not fire proof. One headlight lane at reach 4, 9, 15, 21 and 27 blocks lights the road. Placement is on the top of a block only, never on a liquid, with a 3 by 3 clearance and a height that covers the body. The chase camera is `near`. The default paint is white and all 16 dyes apply. The kind registry maps the scooter to `ScooterDrive`, `SCOOTER_PROFILE` and `SCOOTER_ENTITY`.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "`SCOOTER_SPEC` holds every number."; [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md) Decision
- Implementation: `src/domain/vehicle/kinds/scooter/spec.ts` (`SCOOTER_SPEC`), `src/domain/vehicle/kinds/scooter/profile.ts` (`SCOOTER_PROFILE`, `SCOOTER_MOTION`, `SCOOTER_TYRES`), `src/domain/vehicle/kinds/index.ts`, `src/infrastructure/vehicle/bedrock/identifiers.ts`
- Verification: `tests/domain/vehicle/kinds/scooter/profile.test.ts` "places the passenger behind the driver and fits the hitbox within placement clearance"; `tests/domain/vehicle/kinds/scooter/spec.test.ts` "keeps the medium speed limits aligned and fits the probes and body inside their envelopes". Tests were read, not run for this spec.

### Collision box and entity contract

- Applies to: The scooter's Behavior Pack entity.
- Rule: The server entity has a 0.8125-block-wide, 1.5625-block-high collision box, equal to the profile body width and height, and a damage sensor that rejects every cause. Its footprint circle of 1.3 blocks covers the collision box and every rotated model corner. It is in the families `yasu_ride_vehicle` and `inanimate`, has no knockback and is not pushable by entities. It is rideable with two seats at the profile positions, driver first, and a drive prompt. It declares seven synchronized properties: `yasu_ride:form`, `bank`, `gear_down`, `headlights`, `lean` (-20 to 20), `steer` (-30 to 30) and `stand`. It keeps 16 paint groups and events and the gravity groups of the transforming kinds, and it restores `form` after a reload. Max auto step is 1.0625 blocks.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The collision box is 0.8125 blocks wide and 1.5625 high, with a 1.3-block footprint."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json`, `src/domain/vehicle/kinds/scooter/entity.ts` (`SCOOTER_ENTITY`)
- Verification: `tests/packs/scooter.test.ts` "fits the collision box inside the placement clearance and matches body height", "covers the collision box and every rotated model corner with its footprint", "starts in road form with wheels down and synchronizes the visual defaults"; `tests/domain/vehicle/kinds/scooter/entity.test.ts` "reserves core properties and fits the entity property budget"; `tests/packs/entityContract.test.ts` checks seat positions and locator heights. Tests were read, not run for this spec.

### Ground driving and step probe

- Applies to: Scooter in car form on the ground.
- Rule: `ScooterDrive` extends the shared transforming drive, so ground speed, acceleration, braking, steering, grip, creep and handbrake follow the shared driving rules with the scooter's own copies of the SUV values. The step-up probe uses three lanes at 0 and plus or minus `stepLaneOffset` (0.25 blocks), inside the half width of the narrow body. Ramming damages a mob in front and never the riders, through the shared ram selection with the profile body.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The step-up probe lane offset is a per-kind value"
- Implementation: `src/domain/vehicle/kinds/scooter/drive.ts` (`ScooterDrive`), `src/domain/vehicle/kinds/scooter/spec.ts` (`stepLaneOffset`), `src/domain/vehicle/motion/stepUp.ts` (`stepLanes`)
- Verification: `tests/domain/vehicle/kinds/scooter/spec.test.ts` "keeps the medium speed limits aligned and fits the probes and body inside their envelopes"; `tests/domain/vehicle/motion/stepUp.test.ts` "stepLanes". Tests were read, not run for this spec. Not verified: the feel on a device.

### Lean and steering

- Applies to: Scooter in every form; the entity properties `yasu_ride:lean` and `yasu_ride:steer`.
- Rule: Each tick the lean angle moves toward `steer * maxLean * min(1, |speed| / leanFullSpeed)`, by at most `leanRate` (2 degrees), and never past `maxLean` (20 degrees). Positive means left. Hover and landing use the same sign and speed scaling as car form; both the body and riders lean into flight turns, with bank adding to lean. Releasing steering, take-off (which supplies neutral steering) and a missing driver ease the lean upright at `leanRate` without a jump. The steering angle is the stick input times `maxSteer` (30 degrees), with negative zero folded to zero. The drive sends `lean`, `steer` and `stand` only when the value changes and sends all three again after a resync. The rider lean level comes from the total body roll `lean - bank` (the sum the model's `lean` animation rolls `root` by, positive left, up to `maxLean + maxBank` = 50 degrees in flight): the 1-based index of the nearest `rollLevelAngles` entry (7, 14, 20, 35, 50), 0 below half the first angle, signed, giving five levels per side from -5 to 5 on the ground, in take-off, in flight and in landing. It feeds the riders' pose.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The drive eases a lean angle toward the steering input scaled by speed"
- Implementation: `src/domain/vehicle/kinds/scooter/lean.ts` (`stepLean`, `bodyRoll`, `rollLevel`), `src/domain/vehicle/kinds/scooter/steer.ts` (`steerAngle`), `src/domain/vehicle/kinds/scooter/drive.ts`, `src/domain/vehicle/kinds/scooter/entity.ts` (`leanCommand`, `steerCommand`)
- Verification: `tests/domain/vehicle/kinds/scooter/lean.test.ts` "bounds lean and each tick's change through arbitrary turns", "settles at the speed-scaled and clamped steering target", "has ascending roll level angles that cover the ground range and the total roll", "quantizes body roll into bounded monotone odd-symmetric levels", "takes body roll as lean minus bank, matching the model's lean animation"; `tests/domain/vehicle/kinds/scooter/steer.test.ts` "scales steering within the handlebar limits"; `tests/domain/vehicle/kinds/scooter/drive.test.ts` "leans into hover and landing turns with the ground sign", "bounds flight lean by maxLean and each tick's change by leanRate", "eases flight lean upright when steering is released or the driver leaves", "eases upright during take-off even while steering is held", "resends both inherited and scooter properties after resync". Automated checks cover the drive behavior. Pending: the rider and body lean and steering appearance on PC and mobile, including flight; the in-game test pack cannot seat a player.

### Reverse lean

- Applies to: Scooter steering while reversing.
- Rule: **5.** Lean scales with absolute speed: when reversing while steering left, the scooter still leans left even as its nose turns right.
- Agreement: Proposed
- Basis: `src/domain/vehicle/kinds/scooter/lean.ts` (`stepLean`); `src/domain/vehicle/motion/motion.ts` (ground steering). [0251](../adr/0251-add-the-scooter-kind.md).
- Implementation: `src/domain/vehicle/kinds/scooter/lean.ts`; `src/domain/vehicle/motion/motion.ts`
- Verification: `tests/domain/vehicle/kinds/scooter/lean.test.ts` "leans with steering from upright in either travel direction".

### Centre stand

- Applies to: Scooter in car form; the entity property `yasu_ride:stand`.
- Rule: **3.** The stand is down whenever the scooter receives no drive input and no driver is awaited, also with a rider on it, the speed is under `standSpeed` (0.01 blocks per tick) and the scooter is not on water; otherwise it is up. Outside car form it is up. The client lowers the stand on the property and raises it when the property is false, with short blends. A rider who sends drive input raises it. The folded stand lies horizontal under the floor, pointing at the front tyre: the legs rest about 28 degrees forward of straight down, and `stand_up` turns the stand 62 degrees further forward (`STAND_UP_DEGREES` -62).
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision; `src/domain/vehicle/kinds/scooter/drive.ts` (`step` passes the presence of raw input and the awaited-driver flag to `standDown`); `src/domain/vehicle/kinds/scooter/stand.ts` (`standDown`).
- Implementation: `tools/scooter_stand.py` (stand model), `src/domain/vehicle/kinds/scooter/stand.ts` (`standDown`), `src/domain/vehicle/kinds/scooter/drive.ts`, `packs/yasu_ride_rp/animation_controllers/yasu_ride/scooter.ac.json`
- Verification: `tests/domain/vehicle/kinds/scooter/stand.test.ts` "lowers only when empty, stopped and dry", "stays up at the stopped threshold in either direction"; `tests/domain/vehicle/kinds/scooter/drive.test.ts` "lowers the stand once at rest and raises it when a driver appears"; `tests/packs/scooterClient.test.ts` "raises the stand when the stand property is false with short blends". Tests were read, not run for this spec.

### Water surface

- Applies to: Scooter over water.
- Rule: `SCOOTER_TRANSFORMING.waterPolicy` is `surface`: the scooter never takes the submarine form. In car form it runs on the surface with its ground limits (`maxWaterSpeed` equals `maxSpeed`), is lifted toward `floatDraft` (0.4 blocks) when submerged, and with no driver floats level and still. The stand stays up on water. Take-off from the surface follows the shared double tap. The shared surface rules are in flight-and-submarine.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The kind declares `waterPolicy: "surface"`."
- Implementation: `src/domain/vehicle/kinds/scooter/spec.ts` (`SCOOTER_TRANSFORMING.water`), `src/domain/vehicle/motion/surface.ts`
- Verification: `tests/domain/vehicle/kinds/scooter/drive.test.ts` "never dives and sends visual properties only when their values change", "floats level without a driver and corrects depth toward the surface"; `tests/domain/vehicle/motion/surface.test.ts` "bounds wet surface targets and rises exactly below the float line", "converges from below the surface to the float line without going dry". Tests were read, not run for this spec. Not verified: floating on a device.

### Wheel detail

- Applies to: Front and rear scooter wheels.
- Rule: Both wheels retain white tyre walls, beige discs and chrome dishes. Four raised chrome hex nuts sit at 90-degree intervals with a 45-degree phase on a 0.82 px bolt circle on each exposed negative-x face, opposite the fork and spring. Each 0.32 px-deep nut rises over a wider dark round washer and has a dark hexagonal bevel border around its light face. Each raised part uses one cutout face, avoiding crossed reflection bands. The centre has a 0.55 px-radius round boss, a 0.43 px-radius washer step and a 0.30 px-radius hex nut. Six 0.19 px-radius dark slotted screw heads sit on a distinct painted outer rim ring. Revolved skins form the exposed dish's raised inner hub, recessed step and rolled outer lip, plus a wider polished bead beside a dark line; new relief stays on the negative-x face clear of the fixed suspension. The tyre is a smooth 64-segment carcass with no tread pattern or grooves; its trapezoidal section has a flat, solid-black crown reaching the 4.3 px rolling radius, and its inner side, hidden behind the whitewall disc, has no cubes. Rear radial and hardware dimensions scale by 0.96. No bones, paint regions or material types are added, and roll and fold retain their clearance. Each running wheel assembly contains 777 cubes; their wheel bones contain 780 including the discs and hub plates. The running allocation and usage are both 1,695; total allocation is 4,667 under the 6,000 ceiling.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Wheels."
- Implementation: `tools/scooter_running.py` (`_wheel`, `_wheel_pixel`), `tools/scooter_dims.py` (`AREA_CUBE_ALLOCATION`).
- Verification: `tests/tools/scooterWheelDetail.test.ts` checks hardware layout, block bounds, full-width coverage and equal spacing, and screw pixels; `tests/packs/scooterModel.test.ts` checks size, ancestry and budget; the strut and fold tests retain their clearance checks. Generated previews support visual review; device appearance remains unverified.

### Flat-wheel flight

- Applies to: Scooter in take-off, hover and landing forms.
- Rule: The flight state machine and its limits are the shared transforming drive with `SCOOTER_TRANSFORMING`. The client shows the fold from `yasu_ride:gear_down` and the form: each wheel and hub drops 3.5 px and turns 90 degrees until its plane is horizontal under the body, with a glow disc and hover particles beneath it; landing reverses it before touch-down. The fender, fork and suspension stay. A chrome strut rod follows the drop (not the roll) so each hub stays joined to the body: a telescoping rod slides out of a fixed collar on the steering fork (front) and under the engine and cowl (rear), and stays vertical while the wheel rolls. The rear stem between the sleeve and the cowl is squashed flat on the ground and extends with the drop, so the road silhouette does not change. The stand folds up for flight. Bank follows the shared easing `smooth`. The geometry, glow and animation details are in model-and-previews.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "On take-off each wheel and hub drops 3.5 px and turns 90 degrees"
- Implementation: `src/domain/vehicle/kinds/scooter/spec.ts` (`SCOOTER_TRANSFORMING`), `packs/yasu_ride_rp/animation_controllers/yasu_ride/scooter.ac.json`, `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `tools/scooter_anim.py`
- Verification: `tests/packs/scooterClient.test.ts` "folds each horizontal wheel below every fixed cube with discs and locators underneath", "uses only the four ground and hover states with the shared sound gates"; `tests/tools/scooterStrutFront.test.ts` "keeps the rod on the hub and inside the wider collar throughout the drop", "hides every front strut cube inside the wheel disc bounds at rest"; `tests/tools/scooterStrutRear.test.ts` "keeps the rod inside the collar at rest and at the dropped pose", "hides the sleeve and rod at rest inside the rear tyre", "squashes the stem flat on the ground and extends it with the drop"; `tests/packs/scooterModel.test.ts` "keeps struts outside every fold ancestry". Tests were read, not run for this spec. Not verified: the flight appearance on a device.

### Engine and hover sounds

- Applies to: Scooter client sound playback.
- Rule: The scooter uses its own `yasu_ride.scooter_engine_0..5` sound IDs to play the recorded Vespa `scooter_engine_0..5.ogg` clips, with idle at band 0 and revving slices ordered from low to high at bands 1–5. `tools/scooter_sound.py` owns the six speed band indices, per-clip lengths and volumes in the frozen `ENGINE_CLIPS` table. Idle uses its 2.226167 s clip length and retains its approved 0.030 s seam crossfade and bytes. Rev animations repeat every 1.0 s (20 ticks); their raw Ogg cuts last 1.05 s (50400 samples), with the extra 50 ms set by `ENGINE_OVERLAP_SECONDS`. No fade-in, fade-out or tail-to-head crossfade is used at rev clip edges. Head/tail waveform correlation and firing envelope guide window selection; mean fundamentals strictly increase and endpoint drift stays below 3 Hz. Single-instance rev gain is reduced by 4.5 dB for the coherent sum, whose peak stays below -1 dBFS in offline simulation; the relative overlap RMS bump remains 5.78–7.17 dB. The proposed explanation is a short sound restart gap, still unverified. In-game listening remains unverified. Search scores, windows and summed levels are in [Sounds](sounds.md); volumes remain 0.5, 0.54, 0.58, 0.62, 0.66 and 0.7. Distances and speed gates are unchanged. Hover effects remain shared, with no sonar effect. Band thresholds and playback conditions are described in [Sounds](sounds.md).
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The scooter engine plays its own recorded Vespa clips"; [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md) Decision
- Implementation: `tools/scooter_sound.py` (`ENGINE_CLIPS`, `engine_effect`), `tools/scooter_anim.py`, `packs/yasu_ride_rp/animations/yasu_ride/scooter.anim.json`, `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `packs/yasu_ride_rp/sounds/sound_definitions.json`
- Verification: `tests/packs/scooterClient.test.ts` "resolves scooter engine sounds, shared hover sounds and the hover particle at both disc locators"; `tests/packs/scooterEngineClips.test.ts` "plays band $index from its own Ogg with matching duration and volume", "keeps all six band volumes non-decreasing with idle quietest"; `tests/tools/scooterAnim.test.ts` "generates reversible staged folds, wheel travel, lean, particles and per-clip engine sounds" checks per-clip engine and shared hover animations. Not verified: audibility on a device, because no device was available; manual rows E1 to E6 in `docs/manual-test.md` have empty result cells until someone listens.

### Exhaust smoke

- Applies to: Scooter client particle playback.
- Rule: In road form (`yasu_ride:form == 'car'`) with a rider, the scooter emits `yasu_ride:exhaust_smoke` at the body-mounted `exhaust` locator, including idle. Six looping 1.0 s animations (`exhaust_0..5`) share exactly the engine sound speed gates from `SPEED_BANDS` and `band_condition`. `EXHAUST_PUFFS_PER_SECOND` sets 4, 6, 9, 12, 16 and 20 evenly spaced puffs per second for bands 0 through 5. Each light-grey puff starts at size 0.3, grows by 0.05 per second and fades from opacity 0.6 over 1.6 s. It launches rearward (emitter +z) and slightly down at speed 0.2, with direction `[variable.particle_random_1 - 0.5, -0.25, 1]`, drag 0.3 and upward acceleration 0.15 blocks/s squared. Locator-attached particles emit relative to the emitter, then simulate independently in world space without `emitter_local_space`, leaving a larger, denser trail as the scooter moves. No smoke is emitted without a rider or outside road form. Idle smoke should be clearly visible from the iPad third-person camera, thicken with speed, and leave the rider and model visible from the chase camera. Playback is entirely in the Resource Pack, with no Script API calls or server tick work.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Exhaust smoke."
- Implementation: `tools/scooter_dims.py` (`EXHAUST_PUFFS_PER_SECOND`), `tools/scooter_anim.py`, `tools/scooter_sound.py` (`SPEED_BANDS`, `band_condition`), `tools/gen_scooter.py` (`exhaust` locator), `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `packs/yasu_ride_rp/particles/yasu_ride/exhaust_smoke.particle.json`
- Verification: `tests/tools/scooterAnim.test.ts` "generates six evenly spaced exhaust loops with increasing puff rates"; `tests/tools/scooterSpeedBands.test.ts` "keeps six contiguous speed bands aligned with the shipped engine and exhaust gates"; `tests/packs/scooterClient.test.ts` "emits exhaust only with a rider in road form across all speed boundaries"; `tests/packs/scooterModel.test.ts` "places one exhaust locator at the body-mounted tailpipe outlet"; `tests/packs/exhaustSmoke.test.ts`. Not verified: appearance on a device. The owner must confirm clearly visible idle smoke, increasing density, a trailing plume that follows the vehicle heading and an unobstructed chase camera on PC and mobile, including the iPad third-person view.

### Paint and headlights

- Applies to: Scooter paint, headlight switch and lamps.
- Rule: The scooter has 16 paint variants in the shared dye order, white by default, selected by the shared paint events. `tools/scooter_textures.py` writes paints through `texture_variants.write_variants` in the existing dye order: khaki first as `scooter_paint`, then `scooter_paint_<paint>`. Khaki and white share `scooter_paint.png`; the other 14 paints have distinct colour PNGs. All 15 stored paint texture sets hold the uniform MER value `[0, 0, 90]` through `UniformMer` (ADR 0252). The fixed regions are stored once in `scooter_fixed.png` with `scooter_fixed_mer.png`. No paint MER PNG (`scooter_paint_mer.png`), `scooter_paint_white*` or per-paint MER files are produced. The separate `scooter_lit.png` and `scooter_lit_mer.png` are small lit-only atlases sampled through `geometry.yasu_ride.scooter_lit`. Only paint regions change colour; chrome, rubber, whitewalls, leather, lenses and the plate keep their finishes. A long press with the headlight switch toggles `yasu_ride:headlights`, which lights the headlight, the rear lamp and the orange lamp above it in a separate emissive pass, and the road ahead through the profile beams. Each repaint uses one dye and a plain returned item keeps the default paint.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Paint, the headlight switch"; [0252](../adr/0252-budget-client-entity-texture-memory.md) Decision
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json`, `packs/yasu_ride_rp/render_controllers/yasu_ride/scooter.rc.json`, `tools/scooter_textures.py`, `src/domain/vehicle/kinds/scooter/profile.ts` (`paintPolicy`, `beams`)
- Verification: `tests/packs/scooter.test.ts` "starts with the white variant"; `tests/packs/paint.test.ts` checks scooter paint events; `tests/packs/scooterClient.test.ts` "binds every paint variant and texture in the SUV order", "draws fixed and paint cutouts, a separate hover glow, then the lit lamps last"; `tests/tools/scooterTextures.test.ts`. Tests were read, not run for this spec.

### Render passes

- Applies to: Scooter fixed, paint, hover glow and switched lamp passes.
- Rule: Controllers run in fixed, paint, glow, lit order. The base binds `Texture.fixed` and `Geometry.default` (`geometry.yasu_ride.scooter`); `.paint` binds `Array.paints[query.variant]` in the unchanged dye order and `Geometry.paint` (`geometry.yasu_ride.scooter_paint`). The generator writes the full source geometry to `.cache/generated/scooter_source.geo.json` for shape tests. After packing and relocating the UVs, the generator uses `geometry_passes.partition_geometry` to assign every source face exactly once. PAINT faces go to paint and all other faces go to fixed. It then uses `select_faces` on each partition to drop faces that sample only alpha-0 texels. Every face on `headlights`, `tail_lights` and `glow_*` stays in its assigned pass. Cubes with no faces left are dropped. Both default-material passes use `entity_alphatest`, retain the same materials and part visibility, and have disjoint faces, so order cannot affect the result or cause z-fighting. The `.glow` and `.lit` controllers use `Geometry.lit` (`geometry.yasu_ride.scooter_lit`), containing every face of `headlights`, `tail_lights` and `glow_*` only, selected by `select_faces`. All geometries retain identical bone names, hierarchy, pivots and locators. `SharingPlan` matches identical or mirrored regions within equal material and lit-membership keys in each registry. Packing uses the existing gutter and maximum side. Each pass resolves captured local UV rectangles against its own layout; the lit atlas is unchanged. The complete model is mirrored once before face selection, and each shipped face samples the same region texels as its source face. The preview rejoins the shipped fixed and paint passes in original bone, cube and face order and stacks their textures; lit projection maps through texel centres to preserve mirrored sampling.
- Agreement: Proposed
- Basis: [0193](../adr/0193-shared-texture-tooling.md) Decision; [0251](../adr/0251-add-the-scooter-kind.md) Decision
- Implementation: `tools/gen_scooter.py`, `tools/geometry_passes.py`, `tools/face_crop.py`, `tools/region_atlas.py`, `tools/scooter_textures.py`, `tools/render_preview.py`, `tools/generators.json`; `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `packs/yasu_ride_rp/render_controllers/yasu_ride/scooter.rc.json`
- Verification: `tests/tools/scooterKit.test.ts` checks generated geometry and atlas determinism and preview reassembly. `tests/tools/scooterPaintRegions.test.ts` checks disjoint pass ownership, clear-face removal and retained RGBA samples. `tests/packs/scooterClient.test.ts` checks the lit subset, bone contract and controller bindings. `tests/tools/faceCrop.test.ts` checks that `is_visible` returns false exactly when every sampled alpha is 0. `tests/tools/scooterTextures.test.ts` audits lit regions and compares sampled texels. `pnpm model:check` checks preview identity. Device checks remain with the owner: all 16 dyes near and far, watching paint/chrome seams, with headlights and tail lights on and off. Check hover glow with the gear up while steering and while folding the gear.

### Item and recipe

- Applies to: The scooter item.
- Rule: `yasu_ride:scooter_item` is crafted at a crafting table from three iron ingots and two coal, is always unlocked, stacks to one, and uses the generated scooter icon. English and Japanese lang entries name the item and the entity. Placement, pick-up and fleet limits follow Vehicle items, placement, and fleet limits.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Add the kind `scooter`"
- Implementation: `packs/yasu_ride_bp/recipes/yasu_ride/scooter_item.recipe.json`, `packs/yasu_ride_bp/items/yasu_ride/scooter_item.item.json`, `packs/yasu_ride_rp/texts/en_US.lang`, `packs/yasu_ride_rp/texts/ja_JP.lang`
- Verification: `tests/packs/scooter.test.ts` "crafts a named single-stack scooter item using its registered icon". Tests were read, not run for this spec.

## Open issues

- The riders' pose, the stepped lean look, the compound rotation order of the curved panels, flat-wheel flight and surface floating are unverified on devices; ADR 0251 stays Proposed until the manual Scooter checks pass.
- In-game scenarios for the scooter are tracked separately and are not described here.
