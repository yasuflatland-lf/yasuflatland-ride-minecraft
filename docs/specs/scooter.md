# Scooter

- Scope: The scooter kind: its spec table and profile, collision box and entity contract, ground and water-surface driving, lean, steering and stand, flat-wheel flight, paint, headlights and item. The generated model is covered by Model conventions and rendered previews; the riders' grip pose by Seats and driver selection.
- Verified at: 8ca71e8
- Source: [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md)
- Source: [0055](../adr/0055-kind-neutral-vehicle-core.md)
- Source: [0251](../adr/0251-add-the-scooter-kind.md)
- Excluded: [0083](../adr/0083-ram-targets-are-a-core-sensor.md): ram target selection; the scooter uses the shared core sensor with its profile body
- Excluded: [0087](../adr/0087-sports-boat-spec-table.md): the sports boat spec table; the scooter has its own table
- Excluded: [0009](../adr/0009-vehicle-model-conventions.md): model conventions; the scooter's bone contract is described in model-and-previews
- Excluded: [0040](../adr/0040-submarine.md): the shared submarine and water policy; the surface policy is described in flight-and-submarine
- Excluded: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): compound rotation assemblies; the scooter's registered assemblies are described in model-and-previews
- Excluded: [0250](../adr/0250-scooter-rider-grip-pose-and-stepped-lean.md): the riders' pose and stepped lean; described in seats-and-driver

## Rules

### Spec table, profile and seats

- Applies to: Scooter, driven entity `yasu_ride:scooter`, item `yasu_ride:scooter_item`.
- Rule: The import-free frozen `SCOOTER_SPEC` owns the scooter's tuning: ground speeds (copies of the SUV's numbers, not imports), the collision envelope, seat positions, fleet limit, flight and surface values, bank, lean, steering and stand values. `SCOOTER_MOTION`, `SCOOTER_TYRES`, `SCOOTER_AIR`, `SCOOTER_WATER`, `SCOOTER_TRANSFORMING` and the profile body derive from it. The profile has two seats on the centre line, the driver at z -3.5/16 and the passenger behind at z -9.5/16, boarded in engine order. A fleet limit of 10 per player applies. Riders are not fire proof. One headlight lane at reach 4, 9, 15, 21 and 27 blocks lights the road. Placement is on the top of a block only, never on a liquid, with a 3 by 3 clearance and a height that covers the body. The chase camera is `near`. The default paint is white and all 16 dyes apply. The kind registry maps the scooter to `ScooterDrive`, `SCOOTER_PROFILE` and `SCOOTER_ENTITY`.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "`SCOOTER_SPEC` holds every number."; [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md) Decision
- Implementation: `src/domain/vehicle/kinds/scooter/spec.ts` (`SCOOTER_SPEC`), `src/domain/vehicle/kinds/scooter/profile.ts` (`SCOOTER_PROFILE`, `SCOOTER_MOTION`, `SCOOTER_TYRES`), `src/domain/vehicle/kinds/index.ts`, `src/infrastructure/vehicle/bedrock/identifiers.ts`
- Verification: `tests/domain/vehicle/kinds/scooter/profile.test.ts` "matches the frozen spike's body and driver-first tandem seats"; `tests/domain/vehicle/kinds/scooter/spec.test.ts` "uses ground speed on the surface with probes inside its narrow body". Tests were read, not run for this spec.

### Collision box and entity contract

- Applies to: The scooter's Behavior Pack entity.
- Rule: The server entity has a 0.8125-block-wide, 1.5625-block-high collision box, equal to the profile body width and height, and a damage sensor that rejects every cause. Its footprint circle of 1.3 blocks covers the collision box and every rotated model corner. It is in the families `yasu_ride_vehicle` and `inanimate`, has no knockback and is not pushable by entities. It is rideable with two seats at the profile positions, driver first, and a drive prompt. It declares seven synchronized properties: `yasu_ride:form`, `bank`, `gear_down`, `headlights`, `lean` (-20 to 20), `steer` (-30 to 30) and `stand`. It keeps 16 paint groups and events and the gravity groups of the transforming kinds, and it restores `form` after a reload. Max auto step is 1.0625 blocks.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The collision box is 0.8125 blocks wide and 1.5625 high, with a 1.3-block footprint."
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json`, `src/domain/vehicle/kinds/scooter/entity.ts` (`SCOOTER_ENTITY`)
- Verification: `tests/packs/scooter.test.ts` "matches the profile seats and the model seat locator heights", "fits the collision box inside the placement clearance and matches body height", "covers the collision box and every rotated model corner with its footprint", "starts in road form with wheels down and synchronizes the visual defaults"; `tests/domain/vehicle/kinds/scooter/entity.test.ts` "reserves core properties and fits the entity property budget"; `tests/packs/entityContract.test.ts`. Tests were read, not run for this spec.

### Ground driving and step probe

- Applies to: Scooter in car form on the ground.
- Rule: `ScooterDrive` extends the shared transforming drive, so ground speed, acceleration, braking, steering, grip, creep and handbrake follow the shared driving rules with the scooter's own copies of the SUV values. The step-up probe uses three lanes at 0 and plus or minus `stepLaneOffset` (0.25 blocks), inside the half width of the narrow body. Ramming damages a mob in front and never the riders, through the shared ram selection with the profile body.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The step-up probe lane offset is a per-kind value"
- Implementation: `src/domain/vehicle/kinds/scooter/drive.ts` (`ScooterDrive`), `src/domain/vehicle/kinds/scooter/spec.ts` (`stepLaneOffset`), `src/domain/vehicle/motion/stepUp.ts` (`stepLanes`)
- Verification: `tests/domain/vehicle/kinds/scooter/spec.test.ts` "uses ground speed on the surface with probes inside its narrow body"; `tests/domain/vehicle/motion/stepUp.test.ts` "stepLanes". Tests were read, not run for this spec. Not verified: the feel on a device.

### Lean and steering

- Applies to: Scooter in car form; the entity properties `yasu_ride:lean` and `yasu_ride:steer`.
- Rule: Each tick the lean angle moves toward `steer * maxLean * min(1, |speed| / leanFullSpeed)`, by at most `leanRate` (2 degrees), and never past `maxLean` (20 degrees). Positive means left. Outside car form the target is zero, so the body eases upright over several ticks. The steering angle is the stick input times `maxSteer` (30 degrees), with negative zero folded to zero. The drive sends `lean`, `steer` and `stand` only when the value changes and sends all three again after a resync. The rider lean level (`leanLevels` 3 per side) is the lean angle over `maxLean` rounded to a level from -3 to 3, which feeds the riders' pose.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The drive eases a lean angle toward the steering input scaled by speed"
- Implementation: `src/domain/vehicle/kinds/scooter/lean.ts` (`stepLean`, `leanLevel`), `src/domain/vehicle/kinds/scooter/steer.ts` (`steerAngle`), `src/domain/vehicle/kinds/scooter/drive.ts`, `src/domain/vehicle/kinds/scooter/entity.ts` (`leanCommand`, `steerCommand`)
- Verification: `tests/domain/vehicle/kinds/scooter/lean.test.ts` "bounds lean and each tick's change through arbitrary turns", "settles at the speed-scaled and clamped steering target", "quantizes lean into bounded monotone signed levels"; `tests/domain/vehicle/kinds/scooter/steer.test.ts` "scales steering within the handlebar limits"; `tests/domain/vehicle/kinds/scooter/drive.test.ts` "leans and steers into a ground turn, then eases upright in flight", "resends both inherited and scooter properties after resync". Tests were read, not run for this spec. Not verified: the lean and steering appearance on a device.

### Centre stand

- Applies to: Scooter in car form; the entity property `yasu_ride:stand`.
- Rule: The stand is down when nobody is aboard and no driver is awaited, the speed is under `standSpeed` (0.01 blocks per tick) and the scooter is not on water; otherwise it is up. Outside car form it is up. The client lowers the stand on the property and raises it when the property is false, with short blends. A boarding rider folds it up.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "`yasu_ride:stand` is true when nobody is aboard"
- Implementation: `src/domain/vehicle/kinds/scooter/stand.ts` (`standDown`), `src/domain/vehicle/kinds/scooter/drive.ts`, `packs/yasu_ride_rp/animation_controllers/yasu_ride/scooter.ac.json`
- Verification: `tests/domain/vehicle/kinds/scooter/stand.test.ts` "lowers only when empty, stopped and dry", "stays up at the stopped threshold in either direction"; `tests/domain/vehicle/kinds/scooter/drive.test.ts` "lowers the stand once at rest and raises it when a driver appears"; `tests/packs/scooterClient.test.ts` "raises the stand when the stand property is false with short blends". Tests were read, not run for this spec.

### Water surface

- Applies to: Scooter over water.
- Rule: `SCOOTER_TRANSFORMING.waterPolicy` is `surface`: the scooter never takes the submarine form. In car form it runs on the surface with its ground limits (`maxWaterSpeed` equals `maxSpeed`), is lifted toward `floatDraft` (0.4 blocks) when submerged, and with no driver floats level and still. The stand stays up on water. Take-off from the surface follows the shared double tap. The shared surface rules are in flight-and-submarine.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The kind declares `waterPolicy: "surface"`."
- Implementation: `src/domain/vehicle/kinds/scooter/spec.ts` (`SCOOTER_TRANSFORMING`, `SCOOTER_WATER`), `src/domain/vehicle/motion/surface.ts`
- Verification: `tests/domain/vehicle/kinds/scooter/drive.test.ts` "never dives and sends visual properties only when their values change", "floats level without a driver and corrects depth toward the surface"; `tests/domain/vehicle/motion/surface.test.ts` "bounds wet surface targets and rises exactly below the float line", "converges from below the surface to the float line without going dry". Tests were read, not run for this spec. Not verified: floating on a device.

### Flat-wheel flight

- Applies to: Scooter in take-off, hover and landing forms.
- Rule: The flight state machine and its limits are the shared transforming drive with `SCOOTER_TRANSFORMING`. The client shows the fold from `yasu_ride:gear_down` and the form: each wheel and hub drops 3.5 px and turns 90 degrees until its plane is horizontal under the body, with a glow disc and hover particles beneath it; landing reverses it before touch-down. The fender, fork and suspension stay. The stand folds up for flight. Bank follows the shared easing `smooth`. The geometry, glow and animation details are in model-and-previews.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "On take-off each wheel and hub drops 3.5 px and turns 90 degrees"
- Implementation: `src/domain/vehicle/kinds/scooter/spec.ts` (`SCOOTER_TRANSFORMING`), `packs/yasu_ride_rp/animation_controllers/yasu_ride/scooter.ac.json`, `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `tools/scooter_anim.py`
- Verification: `tests/packs/scooterClient.test.ts` "folds each horizontal wheel below every fixed cube with discs and locators underneath", "uses only the four ground and hover states with the shared sound gates". Tests were read, not run for this spec. Not verified: the flight appearance on a device.

### Engine and hover sounds

- Applies to: Scooter client sound playback.
- Rule: The scooter uses its own `yasu_ride.scooter_engine_0..5` sound IDs to play the recorded Vespa `scooter_engine_0..5.ogg` clips, with idle at band 0 and revving slices ordered from low to high at bands 1–5. `tools/scooter_sound.py` owns the six speed band indices, per-clip lengths and volumes in the frozen `ENGINE_CLIPS` table. Each engine animation uses its clip length and `scooter_engine_<index>` effect. The loop lengths are 3.0, 2.5, 2.0, 2.0, 2.0 and 2.0 seconds; volumes remain 0.5, 0.54, 0.58, 0.62, 0.66 and 0.7. Distances and speed gates are unchanged. Hover effects remain shared, with no sonar effect. Band thresholds and playback conditions are described in [Sounds](sounds.md).
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "The scooter engine plays its own recorded Vespa clips"; [0050](../adr/0050-vehicle-kinds-and-per-kind-profiles.md) Decision
- Implementation: `tools/scooter_sound.py` (`ENGINE_CLIPS`, `engine_effect`), `tools/scooter_anim.py`, `packs/yasu_ride_rp/animations/yasu_ride/scooter.anim.json`, `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `packs/yasu_ride_rp/sounds/sound_definitions.json`
- Verification: `tests/packs/scooterClient.test.ts` "resolves scooter engine sounds, shared hover sounds and the hover particle at both disc locators"; `tests/packs/scooterEngineClips.test.ts` "plays band $index from its own Ogg with matching duration and volume", "keeps all six band volumes non-decreasing with idle quietest"; `tests/tools/scooterAnim.test.ts` "generates reversible staged folds, wheel travel, lean, particles and per-clip engine sounds" checks per-clip engine and shared hover animations. Not verified: audibility on a device, because no device was available; manual rows E1 to E6 in `docs/manual-test.md` have empty result cells until someone listens.

### Paint and headlights

- Applies to: Scooter paint, headlight switch and lamps.
- Rule: The scooter has 16 paint variants in the shared dye order, white by default, selected by the shared paint events. Only paint regions change colour; chrome, rubber, whitewalls, leather, lenses and the plate keep their finishes. A long press with the headlight switch toggles `yasu_ride:headlights`, which lights the headlight, the rear lamp and the orange lamp above it in a separate emissive pass, and the road ahead through the profile beams. Each repaint uses one dye and a plain returned item keeps the default paint.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Paint, the headlight switch"
- Implementation: `packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json`, `packs/yasu_ride_rp/render_controllers/yasu_ride/scooter.rc.json`, `tools/scooter_textures.py`, `src/domain/vehicle/kinds/scooter/profile.ts` (`paintPolicy`, `beams`)
- Verification: `tests/packs/scooter.test.ts` "switches every dye variant while removing the other paint groups"; `tests/packs/scooterClient.test.ts` "binds every paint variant and texture in the SUV order", "draws cutout paint, a separate hover glow, then the lit lamps last"; `tests/tools/scooterTextures.test.ts`. Tests were read, not run for this spec.

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
