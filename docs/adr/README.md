# Architecture Decision Records

This directory records design decisions and the reasons behind them. The format follows Michael Nygard's ADRs (Context, Decision, Consequences). To reverse a decision, do not rewrite the original ADR: add a new ADR and set the original's status to "Superseded by NNNN". When a new ADR adds to an earlier decision without reversing it, set the earlier ADR's status to "Extended by NNNN".

| No. | Decision | Status |
|---|---|---|
| [0001](0001-bedrock-addon-with-stable-script-api.md) | Build a Bedrock add-on and use only the stable Script API | Extended by [0179](0179-support-realms-as-a-second-play-environment.md) (Proposed) |
| [0002](0002-script-driven-vehicle-movement.md) | Drive vehicles by setting their velocity from the script | Extended by 0074 |
| [0003](0003-friction-compensation-and-axis-wall-detection.md) | Estimate and compensate for ground friction, and detect wall collisions per axis | Superseded in part by 0077, 0081, and 0082 |
| [0004](0004-two-block-step-up-by-look-ahead.md) | Climb two-block steps by looking ahead in the script | Superseded in part by 0035 |
| [0005](0005-touch-throttle-compensation.md) | Compensate the throttle from the mobile joystick | Superseded by 0018 |
| [0006](0006-ram-damage-and-occupant-protection.md) | Ram damage detection, and always protecting occupants | Accepted; extended by 0180 (Proposed) |
| [0007](0007-seats-and-driver.md) | Seats and choosing the driver | Superseded by 0019 |
| [0008](0008-vehicle-item-and-breaking.md) | Placing and picking up vehicles | Superseded in part by 0036; extended by 0122 (Proposed) |
| [0009](0009-vehicle-model-conventions.md) | Vehicle model conventions, and accepting a square collision box | Superseded in part by 0170 (SUV collision dimensions; Proposed); extended by 0091, 0093, 0136 (Proposed), and 0139 (Proposed) |
| [0010](0010-testing-strategy.md) | Testing strategy | Accepted; extended by 0139 (Proposed), 0186 (Proposed), and 0188 (Proposed) |
| [0011](0011-dev-server-docker-raknet.md) | Run the development server as BDS in Docker with raknet | Superseded by 0015 |
| [0012](0012-ddd-layered-architecture.md) | Split the code into domain, application, and infrastructure layers | Extended by 0065 |
| [0013](0013-dependency-updates-with-renovate.md) | Keep dependencies up to date with Renovate | Accepted |
| [0014](0014-opt-in-nethernet-dev-server.md) | Offer NetherNet on the dev server as an opt-in transport | Superseded by 0015 |
| [0015](0015-dev-server-docker-nethernet.md) | Run the development server as BDS in Docker with NetherNet | Extended by 0062 |
| [0016](0016-readme-preview-rendered-from-model.md) | Render the README preview from the model files | Superseded by 0027 |
| [0017](0017-repaint-vehicles-with-dye.md) | Repaint vehicles with dye | Superseded by 0031 |
| [0018](0018-sideways-stick-creeps-forward.md) | Treat a sideways stick as a slow forward turn | Extended by 0074 and 0089 |
| [0019](0019-passengers-move-up-to-the-driver-seat.md) | Passengers move up to the driver seat | Superseded in part by 0120 (Proposed); amended by 0126; superseded in part by 0128 |
| [0020](0020-headlights.md) | Headlights that light up the road | Extended by 0115, 0136 (Proposed), and 0139 (Proposed); extended by 0147 and 0184 |
| [0021](0021-flight-mode.md) | Flight mode: toggle with a double tap, climb with the view pitch, and switch gravity with a component group | Superseded in part by 0032, 0034, 0039, and 0078 |
| [0022](0022-fold-wheels-and-glow-in-flight.md) | Fold the wheels and light their undersides in flight | Superseded in part by 0033 and 0043 |
| [0023](0023-starter-vehicle-on-first-join.md) | Give each player a vehicle item on their first join | Extended by 0136 (Proposed) |
| [0024](0024-item-use-on-mobile-and-longer-headlights.md) | Make the vehicle item and the headlight switch work on mobile, and light the road three times farther | Extended by 0115, 0129, [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md) (Proposed), and 0138 (Proposed) |
| [0025](0025-jump-on-touch-and-a-sticky-driver.md) | Keep a touch rider's Jump from dismounting them, and keep the driver while they ride | Superseded in part by 0120 (Proposed); amended by 0126; superseded in part by 0128; extended by 0136 (Proposed) |
| [0026](0026-bank-into-turns-in-flight.md) | Bank into turns in flight | Superseded in part by 0044 |
| [0027](0027-readme-previews-in-three-poses.md) | Render the README previews in three poses | Superseded in part by 0045; extended by 0136 (Proposed) |
| [0028](0028-third-person-camera-in-flight.md) | Switch riders to the third-person camera in flight | Superseded in part by 0052 and 0071 |
| [0029](0029-raise-the-seats.md) | Raise the seats so riders' legs stay inside the body | Superseded in part by 0170 |
| [0030](0030-engine-and-hover-sounds.md) | Engine and hover sounds from client animations, stepped by speed | Extended by 0073 and 0140 (Proposed) |
| [0031](0031-repaint-with-all-sixteen-dyes.md) | Repaint vehicles with all sixteen dyes | Superseded in part by 0036; extended by 0076, [0135](0135-repaint-the-tent-with-dyes.md), and 0136 (Proposed) |
| [0032](0032-climb-with-jump-and-sink-with-the-stick.md) | Climb with held Jump and sink with the stick pulled back | Accepted |
| [0033](0033-lower-the-wheels-before-touchdown.md) | Lower the wheels before touchdown | Accepted; extended by 0181 (Proposed) |
| [0034](0034-touch-down-from-flight.md) | Return to the ground when a flying vehicle sinks onto it | Accepted |
| [0035](0035-jump-one-block-steps-in-the-script.md) | Jump one-block steps in the script, and skip blocks without a collision box | Extended by 0136 (Proposed) and 0138 (Proposed) |
| [0036](0036-paint-by-hitting-with-a-dye.md) | Paint by hitting with a dye, and get in by interacting | Accepted |
| [0037](0037-one-dye-per-repaint-within-a-tick.md) | Use one dye per repaint within a tick | Accepted |
| [0038](0038-keep-at-most-ten-vehicles-in-a-world.md) | Keep at most ten vehicles in a world | Superseded by 0066 |
| [0039](0039-vehicle-forms.md) | Vehicle forms | Superseded in part by 0075 |
| [0040](0040-submarine.md) | Submarine form | Superseded in part by 0042, 0044, 0045, and 0078 |
| [0041](0041-sonar-sound-under-water.md) | Sonar sound under water | Accepted |
| [0042](0042-bronze-four-blade-propellers.md) | Bronze four-blade propellers | Accepted |
| [0043](0043-wheel-arms.md) | Wheel arms in flight and under water | Accepted |
| [0044](0044-bank-under-water.md) | Bank into turns under water | Accepted |
| [0045](0045-submarine-preview.md) | Add a submarine pose to the README previews | Extended by 0136 (Proposed) |
| [0046](0046-organize-each-layer-by-feature.md) | Organize each layer by feature | Extended by 0050, 0055, 0065, 0122 (Proposed), and 0129 |
| [0047](0047-rename-to-yasuflatland-ride.md) | Rename to Yasuflatland Ride | Accepted; extended by 0178 (Proposed) |
| [0048](0048-mutation-testing-and-unused-code-checks.md) | Mutation testing with Stryker, and unused code checks with knip | Extended by 0088 |
| [0049](0049-pack-icons-rendered-from-model.md) | Render pack icons from the hovering SUV model | Accepted |
| [0050](0050-vehicle-kinds-and-per-kind-profiles.md) | Vehicle kinds and per-kind profiles | Superseded in part by 0055; extended by 0120, 0136 (Proposed), 0139 (Proposed), and 0180 (Proposed) |
| [0051](0051-sports-boat.md) | Sports boat | Superseded in part by 0066, 0080, and 0150 (Proposed); extended by 0058, 0063, 0089, 0120, 0158 (Proposed), 0159 (Proposed), 0161 (Proposed), 0162 (Proposed), and 0163 (Proposed) |
| [0052](0052-retry-camera-switches-and-break-seat-ties-low.md) | Retry camera switches in both directions, and break seat ties toward the lower index | Superseded in part by 0117 |
| [0053](0053-estimate-buoyant-boat-water-drag.md) | Estimate the buoyant boat's water drag | Accepted |
| [0054](0054-shard-in-game-tests-in-ci.md) | Shard the in-game tests across four CI jobs and run model:check beside the unit tests | Accepted; extended by 0186 (Proposed), 0187 (Proposed), and 0189 (Proposed) |
| [0055](0055-kind-neutral-vehicle-core.md) | Kind-neutral vehicle core | Superseded in part by 0083 and 0087; extended by 0064, 0065, 0072, 0089, 0090, 0127, 0136 (Proposed), 0137 (Proposed), 0139 (Proposed), 0180 (Proposed), and 0181 (Proposed) |
| [0056](0056-sports-boat-previews.md) | Render README previews of the sports boat | Accepted |
| [0057](0057-skip-model-check-when-inputs-unchanged.md) | Skip model:check on pull requests that leave the renderer's files alone | Accepted; amended in part by [0193](0193-shared-texture-tooling.md) (Proposed) |
| [0058](0058-refine-the-sports-boat-interior.md) | Refine the sports boat interior from reference photos | Accepted |
| [0059](0059-sports-boat-wake-trim-and-roll.md) | Sports boat wake, bow rise, and roll | Superseded in part by 0061 and 0079 |
| [0060](0060-sports-boat-engine-sound.md) | Sports boat engine sound | Accepted; extended by 0140 (Proposed) |
| [0061](0061-lift-the-bow-and-roll-further.md) | Lift the sports boat bow the right way and roll it further | Superseded in part by 0085 |
| [0062](0062-fresh-dev-pack-version-on-every-start.md) | Serve the dev BDS's packs under a fresh dev-only version on every start | Accepted |
| [0063](0063-walk-on-a-stopped-sports-boat.md) | Walk on a stopped sports boat | Superseded in part by 0120 (Proposed); extended by 0064, 0093, 0095, 0096, 0101, 0109, and 0150 (Proposed) |
| [0064](0064-dock-step.md) | Group the hold, floor, and deck seats into an optional dock | Accepted |
| [0065](0065-check-import-rules-with-dependency-cruiser.md) | Check the import rules with dependency-cruiser | Extended by 0072 |
| [0066](0066-limit-vehicles-per-player-and-kind.md) | Limit vehicles per player and per kind | Extended by 0124, 0125, and 0136 (Proposed) |
| [0067](0067-camper.md) | Camper | Superseded in part by 0068 and 0069; extended by 0091, 0093, and 0145 (Proposed) |
| [0068](0068-park-the-camper-with-room-blocks.md) | Park the camper with room blocks | Superseded in part by 0070, 0084, and 0116 (Proposed); extended by 0086, 0092, 0093, 0094, 0095, 0096, 0097, 0098, 0101, 0105, 0109, 0114, 0115, 0118, and 0119 (Proposed) |
| [0069](0069-camper-right-hand-drive.md) | Seat the camper's driver on the right like the SUV | Superseded in part by 0070 |
| [0070](0070-raise-the-camper-front-seats.md) | Raise the camper's front seats | Accepted |
| [0071](0071-pull-the-camper-chase-camera-back.md) | Pull the camper's chase camera back | Accepted |
| [0072](0072-keep-motion-behind-the-kinds.md) | Keep motion/ behind the kinds | Accepted |
| [0073](0073-hover-sound-on-a-riderless-vehicle.md) | Keep the hover sound on a riderless vehicle until its wheels come down | Accepted |
| [0074](0074-light-braking-at-least-coasting.md) | Light braking is never weaker than coasting | Accepted |
| [0075](0075-name-the-medium-step-after-the-medium.md) | Name the shared medium step after the medium | Accepted |
| [0076](0076-per-kind-default-paint.md) | Each kind names its default paint; a dye matching it does nothing | Accepted; extended by [0135](0135-repaint-the-tent-with-dyes.md) and 0136 (Proposed) |
| [0077](0077-never-reverse-the-internal-speed-on-a-wall-hit.md) | Never reverse the internal speed on a wall hit | Superseded in part by 0081 |
| [0078](0078-wait-for-a-passenger-before-landing.md) | Wait for a passenger to move up before landing a driverless flying vehicle | Accepted |
| [0079](0079-roll-by-signed-speed.md) | Roll the sports boat by its signed speed | Accepted |
| [0080](0080-beached-sports-boat-can-reverse.md) | A beached sports boat can only reverse | Superseded in part by 0150 (Proposed) |
| [0081](0081-slide-along-walls.md) | Slide along walls | Accepted |
| [0082](0082-learn-strongly-slowing-surfaces.md) | Learn strongly slowing surfaces | Accepted |
| [0083](0083-ram-targets-are-a-core-sensor.md) | Ram targets are a core-only sensor | Accepted |
| [0084](0084-camper-hitbox-spans-the-bumper.md) | The camper hitbox spans the whole front bumper | Superseded in part by 0116 (Proposed); extended by 0086 |
| [0085](0085-halve-the-sports-boat-bow-rise.md) | Halve the sports boat bow rise | Accepted |
| [0086](0086-camper-hints-near-the-bumper-and-the-parked-driver-seat.md) | Show camper hints near the bumper and the parked driver's seat | Extended by 0116 |
| [0087](0087-sports-boat-spec-table.md) | Keep the sports boat tuning in one spec table | Superseded in part by 0089 |
| [0088](0088-keep-the-in-game-test-fixtures-out-of-mutation.md) | Keep the in-game test fixtures out of mutation testing | Accepted |
| [0089](0089-per-kind-control-mapping.md) | Each kind maps the stick to handbrake and creep | Extended by 0136 (Proposed) |
| [0090](0090-group-the-vehicle-core-by-subcontext.md) | Group the vehicle core by subcontext | Extended by 0129 and 0139 (Proposed) |
| [0091](0091-alpha-blend-only-the-camper-glass.md) | Alpha-blend only the camper glass | Accepted |
| [0092](0092-a-bed-in-the-parked-camper.md) | A bed in the parked camper | Superseded in part by 0182 (spawn point and cargo cells; Proposed); extended by 0093, 0129, [0133](0133-sleep-on-the-tent-mattresses.md), and 0182 (Proposed) |
| [0093](0093-decorate-the-parked-camper.md) | Decorate the parked camper | Superseded in part by 0097, 0098, 0099, 0100, 0102, 0103, 0106, 0108, and 0123 (Proposed); extended by 0094, 0095, 0096, 0101, 0113, 0122 (Proposed), 0139 (Proposed), and 0144 (Proposed) |
| [0094](0094-the-camper-shower-toilet-door-and-shower.md) | The camper's shower-toilet door and shower | Superseded in part by 0098; extended by 0105, 0114, and 0118 |
| [0095](0095-sit-on-the-camper-toilet-while-parked.md) | Sit on the camper toilet while parked | Extended by 0098 and 0109 |
| [0096](0096-keep-the-dock-blocks-whole.md) | Keep a parked vehicle's dock blocks whole | Extended by 0115 |
| [0097](0097-press-the-camper-furniture-to-place-decor.md) | Press the camper furniture to place decor | Superseded in part by 0103 and 0107; extended by 0104 |
| [0098](0098-a-block-for-the-camper-shower-toilet.md) | A block for the camper's shower-toilet | Superseded in part by 0118 |
| [0099](0099-hang-the-camper-planter-inside-its-cell.md) | Hang the camper planter inside its cell | Superseded in part by 0102 |
| [0100](0100-swap-the-camper-stove-and-sink.md) | Swap the camper stove and sink | Superseded in part by 0107 |
| [0101](0101-give-invisible-blocks-a-hidden-cube.md) | Give invisible blocks a hidden cube | Accepted |
| [0102](0102-lift-the-hanging-planter-from-its-cell-bottom.md) | Lift the hanging planter from its cell bottom | Accepted |
| [0103](0103-raise-the-camper-wall-cabinet-to-the-ceiling.md) | Raise the camper wall cabinet to the ceiling | Superseded in part by 0114; extended by 0113 |
| [0104](0104-refuse-a-press-on-a-taken-seat.md) | Refuse a press on a taken seat | Accepted |
| [0105](0105-toggle-a-camper-door-once-per-swing.md) | Toggle a camper door once per swing | Extended by 0114, 0118, 0129, and [0132](0132-open-and-close-each-tent-flap-alone.md) |
| [0106](0106-raise-the-camper-dashboard-to-the-windshield.md) | Raise the camper dashboard to the windshield | Accepted |
| [0107](0107-stand-stove-gear-on-a-burner.md) | Stand stove gear on a burner, and widen the standing decor box | Superseded in part by 0108, 0110, and 0112 |
| [0108](0108-two-items-on-each-shelf-board-and-the-table.md) | Two items on each shelf board and on the table | Superseded in part by 0123 (Proposed); extended by 0114 |
| [0109](0109-stand-up-inside-the-parked-camper.md) | Stand up inside the parked camper | Extended by 0141 (Proposed) |
| [0110](0110-pick-decor-slots-along-the-line-of-sight.md) | Pick decor slots along the line of sight | Extended by 0111 |
| [0111](0111-correct-the-inverted-face-location-height.md) | Correct the inverted face location height | Accepted |
| [0112](0112-one-burner-on-the-camper-stove.md) | One burner on the camper stove | Accepted |
| [0113](0113-a-window-over-the-camper-counter.md) | A window over the camper counter | Extended by 0114; extended by 0146 (Proposed) |
| [0114](0114-open-the-camper-wall-cabinet.md) | Open the camper wall cabinet | Extended by 0121 |
| [0115](0115-camper-ceiling-lights.md) | Ceiling lights in the parked camper | Extended by 0123 (Proposed) and [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md) (Proposed); extended by 0147; superseded in part by 0149 |
| [0116](0116-a-bumper-stand-in-takes-the-camper-hits.md) | A bumper stand-in takes the camper's hits | Proposed; extended by 0119 (Proposed) |
| [0117](0117-move-the-suv-front-seats-back.md) | Move the SUV's front seats back | Superseded in part by 0170 |
| [0118](0118-close-the-camper-shower-door-from-either-side.md) | Close the camper shower door from either side | Accepted |
| [0119](0119-park-the-camper-over-natural-ground.md) | Park the camper over natural ground, and lift its bumper stand-in out of it | Proposed |
| [0120](0120-choose-a-sports-boat-seat-by-aiming-at-it.md) | Choose a sports boat seat by aiming at it | Proposed; extended by 0154 (Proposed) |
| [0121](0121-doored-storage-in-the-camper.md) | Doored storage in the camper | Extended by 0123 (Proposed) |
| [0122](0122-a-low-chair-to-sit-on-outside-the-vehicles.md) | A low chair to sit on outside the vehicles | Proposed; extended by 0129, [0130](0130-a-tent-entity-whose-hits-land-on-its-blocks.md), [0131](0131-pitch-a-tent-in-the-camp.md), 0144 (Proposed), and 0180 (Proposed) |
| [0123](0123-a-fridge-in-place-of-the-camper-shelf.md) | A fridge in place of the camper shelf | Proposed |
| [0124](0124-take-back-an-eviction-when-a-slot-frees.md) | Take back an eviction when a slot frees | Extended by 0125 |
| [0125](0125-forget-a-vehicle-removed-from-a-loaded-chunk.md) | Forget a vehicle removed from a loaded chunk | Accepted |
| [0126](0126-choose-a-new-driver-with-one-tick-of-motion.md) | Choose a new driver with one tick of motion | Accepted; superseded in part by 0128 |
| [0127](0127-resend-every-synced-entity-value-after-a-failed-send.md) | Resend every synced entity value after a failed send | Accepted; extended by 0136 (Proposed) and 0156 (Proposed) |
| [0128](0128-settle-every-crews-seats-by-rider-list.md) | Settle every crew's seats by the rider list | Accepted |
| [0129](0129-share-room-primitives-between-features.md) | Share room primitives between features | Accepted; extended by [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md) (Proposed) |
| [0130](0130-a-tent-entity-whose-hits-land-on-its-blocks.md) | A tent entity whose hits land on its blocks | Proposed; extended by [0131](0131-pitch-a-tent-in-the-camp.md) |
| [0131](0131-pitch-a-tent-in-the-camp.md) | Pitch a tent in the camp | Proposed; extended by [0132](0132-open-and-close-each-tent-flap-alone.md), [0133](0133-sleep-on-the-tent-mattresses.md), [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md), and [0135](0135-repaint-the-tent-with-dyes.md) |
| [0132](0132-open-and-close-each-tent-flap-alone.md) | Open and close each tent flap alone | Proposed |
| [0133](0133-sleep-on-the-tent-mattresses.md) | Sleep on the tent mattresses | Proposed |
| [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md) | Switch the tent lantern with the headlight switch | Proposed; extended by 0138 (Proposed) |
| [0135](0135-repaint-the-tent-with-dyes.md) | Repaint the tent with dyes | Proposed |
| [0136](0136-bulldozer.md) | Add the bulldozer kind | Proposed; superseded in part and extended by 0138 (Proposed), 0140 (Proposed), and 0141 (Proposed); extended by 0146 (Proposed); extended by 0147, 0148, and 0151 (Proposed); submarine no-cut rule superseded by 0155 (Proposed); extended by 0178 (Proposed), 0180 (Proposed), and 0181 (Proposed) |
| [0137](0137-clear-block-columns-with-the-blade.md) | Clear block columns with the blade, keeping liquids, containers, and laid blocks | Proposed; extended by 0138 (Proposed), 0155 (Proposed), 0178 (Proposed), and 0181 (Proposed) |
| [0138](0138-raise-and-lower-the-bulldozer-blade.md) | Raise and lower the bulldozer blade with a switch item | Proposed; extended by 0139 (Proposed), 0140 (Proposed), 0148 (Proposed), 0151 (Proposed), 0155 (Proposed), and 0180 (Proposed); creative group superseded in part by 0178 (Proposed) |
| [0139](0139-show-the-held-tool-on-the-cab-monitor.md) | Show the driver's held tool on the cab monitor | Proposed; superseded in part by 0171 (Proposed) and 0178 (Proposed); extended by 0180 (Proposed) and 0181 (Proposed) |
| [0140](0140-bulldozer-sounds.md) | Give the bulldozer its own engine, track, and blade hydraulic sounds | Proposed |
| [0141](0141-put-a-bulldozer-driver-out-beside-the-left-door.md) | Put a bulldozer driver out beside the left door | Proposed |
| [0144](0144-split-camping-gear-into-inside-and-outside-groups.md) | Split camping gear into inside and outside groups | Proposed; Bulldozer Switches group superseded in part by 0178 (Proposed) |
| [0145](0145-move-camper-side-lamp-and-door-handle.md) | Move the camper's side lamp and door handle | Proposed |
| [0146](0146-wire-mesh-bulldozer-steps-and-a-camper-vent-cover.md) | Wire mesh bulldozer steps and a camper vent cover | Proposed; superseded in part by 0157 (Proposed) |
| [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md) | Light the lamps with a PBR emissive layer | Accepted; extended by 0159 (Proposed) and 0163 (Proposed); extended by 0184; amended in part by [0193](0193-shared-texture-tooling.md) (Proposed) |
| [0148](0148-smooth-bulldozer-side-bevel.md) | Smooth the bulldozer side bevel | Proposed; extended by 0151 (Proposed) |
| [0149](0149-route-the-parked-camper-wheel-seat-to-headlights.md) | Route the parked camper's wheel seat to the headlights | Accepted |
| [0150](0150-run-the-sports-boat-on-lava.md) | Run the sports boat on lava | Proposed |
| [0151](0151-enclose-the-bulldozer-blade-supports.md) | Enclose the bulldozer blade supports | Proposed |
| [0152](0152-a-two-seat-folding-camp-table.md) | A two-seat folding camp table | Proposed; superseded in part (the top holds a Dutch oven) by 0168 (Proposed); superseded in part (no seats, the top holds ovens and lanterns) by 0185 (Proposed) |
| [0153](0153-a-polished-folding-fire-pit.md) | A polished folding fire pit | Proposed |
| [0154](0154-keep-camper-passengers-in-their-seats-on-departure.md) | Keep camper passengers in their seats on departure | Proposed |
| [0155](0155-cut-under-water-and-dig-a-shaft-when-rising.md) | Cut under water and dig a wide shaft when rising | Proposed |
| [0156](0156-resend-the-docked-property-after-a-failed-send.md) | Resend the docked property after a failed send | Proposed |
| [0157](0157-an-aluminium-rimmed-louvred-camper-vent-lid.md) | An aluminium-rimmed louvred camper vent lid | Proposed |
| [0158](0158-a-slanted-pane-sports-boat-windshield.md) | A slanted-pane sports boat windshield | Proposed; extended by 0161 (Proposed) |
| [0159](0159-a-pbr-rear-view-mirror-on-the-sports-boat.md) | A PBR rear-view mirror on the sports boat | Proposed; extended by 0163 (Proposed) |
| [0161](0161-smooth-sports-boat-hull-planking.md) | Smooth sports boat hull planking | Proposed; extended by 0162 (Proposed); superseded in part by [0172](0172-smooth-sports-boat-headlight-lenses.md) (Proposed) |
| [0162](0162-smooth-the-sports-boat-bows-inner-outline.md) | Smooth the sports boat bow's inner outline | Proposed |
| [0163](0163-a-glossy-clear-coat-sports-boat-hull.md) | A glossy clear-coat sports boat hull | Proposed |
| [0164](0164-long-sports-boat-bimini-panels.md) | Long sports boat bimini panels | Proposed |
| [0165](0165-cylindrical-sports-boat-tower-speakers.md) | Cylindrical sports boat tower speakers | Proposed |
| [0166](0166-tilted-two-axis-sports-boat-helm-assemblies.md) | Tilted two-axis assemblies on the sports boat helm | Proposed |
| [0167](0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) | Compound-rotation assemblies as a vehicle-neutral rule | Proposed |
| [0168](0168-a-dutch-oven-and-a-grill-for-the-fire-pit.md) | A Dutch oven and a grill for the fire pit | Proposed; superseded in part (rule 1: new table ovens go at the aimed point, not two fixed spots; rule 5: a missing host removes the oven with no drop; rule 8: an overlap and limit check replaces the occupied-spot refusal on a table; the table may now hold Gas Lanterns) by 0185 (Proposed); superseded in part (rule 2 and the isSimmering note: the host sets the initial state only; presses toggle it on every host) by [0191](0191-press-camp-gear-without-the-light-tool.md) (Proposed) |
| [0169](0169-a-lantern-for-the-oil-lamp-and-a-noga-chair.md) | A Lantern for the Oil Lamp, no Lava Lamp, and a Noga Chair | Proposed; superseded in part by [0173](0173-remove-the-inside-lantern-and-add-the-gas-lantern.md) (Proposed) |
| [0170](0170-measure-suv-side-view-proportions.md) | Measure SUV side-view proportions against a fixed wheel diameter | Proposed; size-anchor numbers superseded in part by [0194](0194-enlarge-the-suv-for-seated-head-clearance.md) (Proposed) |
| [0171](0171-sports-boat-equipment-and-icebreaker-mode.md) | Sports Boat Equipment and icebreaker mode | Proposed; superseded in part by [0174](0174-show-only-the-icebreaker-switch-in-the-equipment-group.md) (Proposed) and [0175](0175-keep-the-icebreaker-cut-above-the-hull-floor.md) (Proposed), and group position by 0178 (Proposed) |
| [0172](0172-smooth-sports-boat-headlight-lenses.md) | Smooth sports boat headlight lenses | Proposed |
| [0173](0173-remove-the-inside-lantern-and-add-the-gas-lantern.md) | Remove the inside Lantern and add the Gas Lantern | Proposed; extended (a Gas Lantern may stand on a Camp Table and is removed with it) by 0185 (Proposed); superseded in part (rule 12: presses with any item or an empty hand switch the lantern; hits switch only with the light tool) by [0191](0191-press-camp-gear-without-the-light-tool.md) (Proposed) |
| [0174](0174-show-only-the-icebreaker-switch-in-the-equipment-group.md) | Show only the Icebreaker Switch in the equipment group | Proposed; group position superseded in part by 0178 (Proposed) |
| [0175](0175-keep-the-icebreaker-cut-above-the-hull-floor.md) | Keep the icebreaker cut above the hull floor | Proposed |
| [0176](0176-move-the-sports-boat-front-seats-back.md) | Move the sports boat's front seats back | Accepted |
| [0177](0177-drive-text-on-the-sports-boat-driver-deck-seat.md) | Drive text on the sports boat driver deck seat | Accepted |
| [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md) | Bulldozer build tools in a separate namespace | Proposed; extended by 0180 (Proposed), 0181 (Proposed), and 0183 (Proposed) |
| [0179](0179-support-realms-as-a-second-play-environment.md) | Support Realms as a second play environment | Proposed |
| [0180](0180-a-wide-bulldozer-blade.md) | A wide bulldozer blade switched from the cab | Proposed; extended by 0181 (Proposed) |
| [0181](0181-a-road-paver-on-the-bulldozer.md) | Lay a road behind the bulldozer from the driver's held block | Proposed |
| [0182](0182-a-bunk-bed-in-the-parked-camper.md) | A bunk bed in the parked camper | Proposed |
| [0183](0183-mark-a-lone-selection-corner.md) | Mark a lone selection corner | Proposed |
| [0184](0184-light-the-camper-roof-and-tail-lamps.md) | Light the camper's roof and tail lamps with the headlights | Accepted |
| [0185](0185-put-things-on-the-camp-table-instead-of-sitting-at-it.md) | Put things on the camp table instead of sitting at it | Proposed |
| [0186](0186-stream-in-game-results-and-bound-runs-by-progress.md) | Stream in-game results and bound runs by progress | Proposed |
| [0187](0187-run-in-game-scenarios-in-concurrent-lanes.md) | Run in-game scenarios in concurrent lanes | Proposed |
| [0188](0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md) | Fuse in-game scenarios and keep only engine facts in game | Proposed |
| [0189](0189-run-only-impacted-in-game-scenarios-locally.md) | Run only impacted in-game scenarios locally | Proposed |
| [0190](0190-ribbed-camper-shell-atlas.md) | A ribbed camper shell atlas and trim | Proposed |
| [0191](0191-press-camp-gear-without-the-light-tool.md) | Press camp gear without the light tool | Proposed |
| [0192](0192-suv-detailed-body.md) | Detail the SUV body, dashboard and lamps | Proposed |
| [0193](0193-shared-texture-tooling.md) | Share texture tooling between generators | Proposed |
| [0194](0194-enlarge-the-suv-for-seated-head-clearance.md) | Enlarge the SUV for seated head clearance | Proposed |

The measurements and in-game tests behind these decisions are in [the driving-core spike findings](../spike-driving-core.md).

## Writing a new ADR

1. Copy the structure of an existing ADR into `NNNN-short-kebab-title.md`, using the next free number
2. Fill in `Status` (`Proposed` or `Accepted`) and `Date` (YYYY-MM-DD), then the three sections:
   - **Context**: the forces at play and what was tried, including measured numbers
   - **Decision**: what we will do, as concrete rules with their values
   - **Consequences**: what follows, including the downsides we accept and the conditions under which to revisit the decision
3. Add a row to the table above
4. Write in English. Refer to other ADRs by their four-digit number, for example "(0006)"
