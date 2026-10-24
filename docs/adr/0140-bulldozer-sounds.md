# 0140. Give the bulldozer its own engine, track, and blade hydraulic sounds

- Status: Proposed
- Date: 2026-10-24
- Extends: [0030](0030-engine-and-hover-sounds.md), [0060](0060-sports-boat-engine-sound.md), [0136](0136-bulldozer.md), [0138](0138-raise-and-lower-the-bulldozer-blade.md)

## Context

The bulldozer uses the SUV's single-cylinder diesel clips. Its client entity already owns its sound map and speed conditions, so 0050 needs no preparatory refactor. No shared or script logic changes. The SUV, camper, and sports boat keep their existing files and sounds byte for byte.

The owner chose the D5 [working reference](https://www.youtube.com/watch?v=uU2OLi5t4dw) and [idling reference, "CAT D5 Engine sound"](https://www.youtube.com/watch?v=BNgsi4zvP5I). Their audio is neither copied nor downloaded. They set the character: a deep six-cylinder rumble, turbo whistle, labor under load, and steel track clank and squeal.

The client reads ground speed, form, and the synced blade float. The blade moves in 0.1 steps over 10 ticks, resting at 0 or 1 (0138). Cutting requires a fully lowered blade and speed above 0.02 blocks/tick; moving sound bands begin at 0.5 blocks/s = 0.025 blocks/tick. The bulldozer tops out at 9 blocks/s (0136). Client animations have no pitch control (0030); whole-cycle loops and ring() filtering two copies preserve their seams.

| Item | Value | Source |
|---|---|---|
| Engine | Cat C7.1, inline six, four-stroke, turbocharged and aftercooled, direct injection. The current D5 does not use the C9.3B; that engine is in the D6 and D7 | D5 Technical Specifications (Cat, via dealer CGT): https://www.cgt.it/sites/default/files/d5_technical_specifications_en.pdf ; C7.1 engine page: https://www.cat.com/en_US/products/new/power-systems/industrial/industrial-diesel-power-units/18595859.html |
| Bore, stroke, displacement | 105 mm, 135 mm, 7.1 L | D5 Technical Specifications |
| Net power | 127 kW (170 hp) at 1,770 rpm (rated speed) | D5 Technical Specifications |
| Maximum power | 151 kW (202 hp, SAE J1995) at 1,600 rpm | D5 Technical Specifications |
| Low idle, high idle | Not in the spec sheet. 800 ± 50 rpm low idle and 1,880 ± 50 rpm no-load high idle are typical Cat machine values from a Cat engine-speed test procedure that does not name its model. **Assumptions, not D5 measurements** | (unverified) |
| Travel speed | 3-speed automatic, top forward 9.8 km/h (2.72 m/s), top reverse 12.2 km/h | D5 Technical Specifications |
| Undercarriage | 40 sections per side, 7 bottom rollers, 2,562 mm of track on the ground, 1,890 mm gauge | D5 Technical Specifications |
| Track pitch | Not in the spec sheet. About 0.19 m, derived: the loop is about 2 x 2.6 m plus the wrap around the idler and sprocket (pi x about 0.72 m), about 7.5 m, over 40 sections. **Derived estimate** | derived from the D5 Technical Specifications |
| Implement pump | 127 L/min, 25,000 kPa maximum implement pressure | D5 Technical Specifications |

## Decision

Synthesize 16 one-second loops and one half-second one-shot at 22050 Hz, mono 16-bit PCM, in `tools/gen_sounds.py`. Append the new writes after the shower, with independent seeds 140 (engine and push), 141 (tracks), and 142 (hydraulics). Existing generator code and seeds stay unchanged.

Engine and track layers use `G = query.has_rider && query.property('yasu_ride:form') == 'car'`. Exactly one engine level plays: idle below 0.5 blocks/s, otherwise one of five travel levels when blade >= 0.05, or five push levels when blade < 0.05. This threshold distinguishes fully lowered from the 0.1 steps without exact float equality after sync. Lowering plays travel until it finishes. Push runs fewer rpm but sounds heavier and louder. Exactly one track level plays in each moving speed band, independently of the blade.

Hydraulics runs through an unconditional controller entry: initial `rest` enters `moving` at blade >= 0.05 and <= 0.95; `moving` plays only `hydraulics_sound` and returns to `rest` at blade < 0.05 or > 0.95. The non-looping 0.5 s clip matches 10 ticks of blade travel. It starts one tick after leaving an endpoint (0.1 or 0.9). Mid-travel reversal stays in moving and does not restart the clip. The existing form controller is unchanged, including the hover and sonar clips from the SUV, as requested in 0136.

**Firing frequency.** A four-stroke engine fires each cylinder once every two turns, so six cylinders fire `rpm / 60 x 6 / 2 = rpm / 20` times a second, and one engine cycle (all six firings) takes `120 / rpm` s. A 1 s loop repeats without a seam in the per-cylinder pattern only if it holds whole cycles, so each level runs at `rpm = 120 x c` for a whole number of cycles `c` per second:

| Target | Spec rpm | Cycles/s c | Loop rpm | Firings/s | Error |
|---|---|---|---|---|---|
| Low idle | 800 (assumed) | 7 | 840 | 42 | +5 %, inside the assumed ± 50 rpm |
| Maximum power, the lug point under load | 1,600 | 13 | 1,560 | 78 | -2.5 % |
| Rated speed, full load | 1,770 | 15 | 1,800 | 90 | +1.7 % |
| High idle, no load | 1,880 (assumed) | 16 | 1,920 | 96 | +2.1 %, inside the assumed ± 50 rpm |

**Track link rate.** The bulldozer drives 3.3 times faster than the real D5 (9 blocks/s against 2.72 m/s, the owner's choice in 0136). A link rate at the in-game speed with a 0.19 m pitch would reach 47 clanks/s per track at top speed, a buzz rather than a clank. The tracks instead sound as the D5's do at the same fraction of top speed: at top forward speed the D5 passes `2.72 / 0.19 = 14.3` links/s per track, so a level at representative speed `v` blocks/s plays `14.3 x v / 9` links/s, rounded to a whole number so the 1 s loop holds whole links.

| Level | Band (blocks/s) | Representative v | 14.3 x v / 9 | Links/s per track |
|---|---|---|---|---|
| 1 | 0.5-2.25 | 1.375 (midpoint) | 2.18 | 2 |
| 2 | 2.25-4 | 3.125 | 4.97 | 5 |
| 3 | 4-5.75 | 4.875 | 7.75 | 8 |
| 4 | 5.75-7.5 | 6.625 | 10.5 | 11 |
| 5 | >= 7.5 | 8.25 (midpoint of 7.5-9) | 13.1 | 13 |


Travel cycles/s are [9, 11, 13, 14, 16] (1080, 1320, 1560, 1680, 1920 rpm); push cycles/s are [8, 10, 12, 13, 15] (960, 1200, 1440, 1560, 1800 rpm). Idle is 7 cycles/s. Intermediate levels are character choices, not measured engine operating points.

| Short animation name (ce) | Animation id | Effect name | Sound id | WAV | Condition | Volume |
|---|---|---|---|---|---|---|
| `engine_sound_0` | `animation.yasu_ride.bulldozer.engine_sound_0`  | `engine_0` | `yasu_ride.bulldozer_engine_0` | `bulldozer_engine_0.wav` | `G && query.ground_speed < 0.5` (unchanged) | 0.5 |
| `engine_sound_1`..`_5` | `...engine_sound_1`..`_5`  | `engine_1`..`_5` | `yasu_ride.bulldozer_engine_1`..`_5` | `bulldozer_engine_1`..`_5.wav` | `G && query.property('yasu_ride:blade') >= 0.05 && <band>` | 0.54, 0.58, 0.62, 0.66, 0.7 |
| `push_sound_1`..`_5` | `animation.yasu_ride.bulldozer.push_sound_1`..`_5`  | `push_1`..`_5` | `yasu_ride.bulldozer_push_1`..`_5` | `bulldozer_push_1`..`_5.wav` | `G && query.property('yasu_ride:blade') < 0.05 && <band>` | 0.6, 0.65, 0.7, 0.75, 0.8 |
| `track_sound_1`..`_5` | `animation.yasu_ride.bulldozer.track_sound_1`..`_5`  | `track_1`..`_5` | `yasu_ride.bulldozer_track_1`..`_5` | `bulldozer_track_1`..`_5.wav` | `G && <band>` | 0.25, 0.3, 0.35, 0.4, 0.45 |
| `hydraulics` | `controller.animation.yasu_ride.bulldozer.hydraulics`  | - | - | - | always (an unconditional `animate` entry) | - |
| `hydraulics_sound` | `animation.yasu_ride.bulldozer.hydraulics_sound`  | `hydraulics` | `yasu_ride.bulldozer_hydraulics` | `bulldozer_hydraulics.wav` | played by the controller | 0.35 |

`<band>` for level 1 to 5, written exactly as the existing entries do: `query.ground_speed >= 0.5 && query.ground_speed < 2.25`, `>= 2.25 && < 4`, `>= 4 && < 5.75`, `>= 5.75 && < 7.5`, `>= 7.5` (no upper bound). The condition string puts `G` first, then the blade clause, then the speed clause, so `tests/support/soundLevels.ts` `speedRanges` keeps parsing it.

All WAVs go to `packs/yasu_ride_rp/sounds/yasu_ride/`. Every definition uses `"category": "neutral"`. Engine and push: `min_distance` 4.0, `max_distance` 32.0 (a 17 t machine is heard farther than the SUV's 24). Tracks: 4.0 and 24.0. Hydraulics: 2.0 and 16.0. Append the new definitions after `yasu_ride.shower` in `sound_definitions.json`; leave every existing entry unchanged.


The client animate order is form, drive, hydraulics, engine_sound_0 through _5, push_sound_1 through _5, then track_sound_1 through _5. Conditions put G first, then the blade clause when applicable, then speed. Each sound animation fires its matching effect at 0.0; engine, push, and track animations loop for 1.0 s.

Synthesis character values below are chosen by ear against the references, not measured:

- The usual inline-six firing order is [1, 5, 3, 6, 2, 4], not checked against Cat's manual. Six cylinder trims (0.88-1.0) repeat each cycle; firing strengths vary by 0.85-1.0. Timing jitter is 4% of the gap at idle, and 2%-1% across moving levels. Exhaust pops last 10 ms, or 14 ms under push, with 3 ms knocks 1 ms later. Knock shares are 1.0 idle, 0.8-0.5 travel, 0.6-0.4 push.
- Exhaust resonances (Hz, Q, gain) are [(38, 4, 1), (75, 5, 0.85), (125, 4, 0.45), (240, 3, 0.2)], and knock resonances [(1700, 5, 0.22), (2900, 6, 0.14)]. The lower exhaust emphasis stands for the 7.1 L engine and tall stack (SUV resonances: 60, 95, 180 Hz). Peak-normalize the combined rings, then tanh with drive 1.4 idle, 1.6 travel, 2.2 push; push adds an 8% 2 Hz labor swell.
- Whistles (Hz, gain): idle (2100, 0.03); travel [(2600, 0.04), (3100, 0.05), (3600, 0.06), (3900, 0.07), (4400, 0.08)]; push [(3000, 0.08), (3700, 0.10), (4400, 0.12), (4800, 0.13), (5400, 0.15)]. A 3 Hz wobble deviates 0.4%. Integer frequencies and modulation hold whole cycles. Intake hiss uses 200 whole-Hz sines from 1500-6000 Hz, with gains 0.02 idle, 0.03-0.06 travel, 0.06-0.12 push.
- Two track trains have a 0.37-link offset, 5% jitter, strengths 0.6-1.0, and 4 ms bursts shared at half strength with the thud. Clank resonances are [(520, 12, 0.6), (1150, 18, 0.5), (2300, 22, 0.3), (3700, 25, 0.15)], thud [(90, 3, 0.5)]. Peak-normalize their sum. Squeal uses 40 sines at 1450-1650 Hz, gains [0, 0.03, 0.06, 0.09, 0.12], and 30% 1 Hz modulation. Roller rumble uses 120 sines at 40-200 Hz with gains [0.1, 0.15, 0.2, 0.25, 0.3].
- The pump starts at 380 Hz, rises 5% with integrated phase, and adds 2x and 3x harmonics at 0.5 and 0.25. Oil hiss is band-passed at 3000 Hz, Q 1, gain 0.15. Linear 30 ms attack and 80 ms release make both endpoints zero.

Bump the Resource Pack header and module and the Behavior Pack dependency to [0, 1, 121] (0015). No beta API or script changes are needed.

## Consequences

- The Resource Pack gains 17 WAVs, about 720 KB (16 one-second files of 44.1 KB and one half-second file).
- The engine steps between levels and follows speed, not throttle (0030, 0060): holding forward against a wall reads as idle.
- Push plays whenever the fully lowered blade moves, even over air where nothing is cut; the client cannot tell whether a block was cut.
- A pivot in place has ground speed near zero, so tracks are silent even though their animation runs.
- Low and high idle are assumptions. Revisit them if a D5 service manual provides other values.
- Accept with 0136 after the owner's listening check, B18-B22 on PC and mobile in [the manual checklist](../manual-test.md). Record any owner-requested retuning here; none has been requested yet.
