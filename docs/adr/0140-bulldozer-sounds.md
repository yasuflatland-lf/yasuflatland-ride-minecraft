# 0140. Give the bulldozer its own engine, track, and blade hydraulic sounds

- Status: Proposed
- Date: 2026-10-24
- Extends: [0030](0030-engine-and-hover-sounds.md), [0060](0060-sports-boat-engine-sound.md), [0136](0136-bulldozer.md), [0138](0138-raise-and-lower-the-bulldozer-blade.md)

## Context

The bulldozer uses the SUV's single-cylinder diesel clips. Its client entity already owns its sound map and speed conditions, so 0050 needs no preparatory refactor. No shared or script logic changes. The SUV, camper, and sports boat keep their existing files and sounds byte for byte.

The owner first chose the D5 [working reference](https://www.youtube.com/watch?v=uU2OLi5t4dw) and [idling reference, "CAT D5 Engine sound"](https://www.youtube.com/watch?v=BNgsi4zvP5I), and set the character: a deep six-cylinder rumble, turbo whistle, labor under load, and steel track clank and squeal. After listening in game they retuned the engine and the blade several times (see "Retuning" under Decision), dropping the whistle and ending with their own phone recording of a dozer as the target. No reference audio is copied into the repository.

The client reads ground speed, form, and the synced blade float. The blade moves in 0.1 steps over 10 ticks, resting at 0 or 1 (0138). In car form the blade cuts only while it is fully lowered, the bulldozer is on the ground, the driver is not steering, and the signed speed is above 0.02 blocks/tick, so reversing never cuts (`BulldozerDrive.bladeCut`). The client cannot read the steering input or the drive direction, because `query.ground_speed` is unsigned. Moving sound bands begin at 0.5 blocks/s = 0.025 blocks/tick. The bulldozer tops out at 9 blocks/s (0136). Client animations have no pitch control (0030); whole-cycle loops and ring() filtering two copies preserve their seams.

The D5 specification below is background. It set the first engine speeds and still sets the track link rates, but the engine that plays now follows the owner's ear and recording instead of the rpm table derived from it.

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

Synthesize 11 four-second engine and push loops, 5 one-second track loops, and one 0.9 s hydraulics one-shot at 22050 Hz, mono 16-bit PCM, in `tools/gen_sounds.py`. Append the new writes after the shower, with independent seeds 140 (engine and push), 141 (tracks), and 142 (hydraulics). Existing generator code and seeds stay unchanged.

Engine and track layers use `G = query.has_rider && query.property('yasu_ride:form') == 'car'`. Exactly one engine level plays: idle below 0.5 blocks/s, otherwise one of five travel levels when blade >= 0.05, or five push levels when blade < 0.05. This threshold distinguishes fully lowered from the 0.1 steps without exact float equality after sync. Lowering plays travel until it finishes. Push runs slower but sounds heavier and louder. Exactly one track level plays in each moving speed band, independently of the blade.

Hydraulics runs through an unconditional controller entry: initial `rest` enters `moving` at blade >= 0.05 and <= 0.95; `moving` plays only `hydraulics_sound` and returns to `rest` at blade < 0.05 or > 0.95. The non-looping 0.9 s clip starts one tick after the blade leaves an endpoint (0.1 or 0.9), so its 0.5 s groan covers the remaining 9 ticks of travel and the stop clunk at 0.5 s follows about one tick after the blade stops, then the relief hiss plays out. Mid-travel reversal stays in moving and does not restart the clip. The existing form controller is unchanged, including the hover and sonar clips from the SUV, as requested in 0136.

**Engine speed, from the owner's recording.** The owner supplied their own phone recording of the section from 53 s to about 1:10 of https://www.youtube.com/watch?v=M0yyrtj3rmE. It was decoded and analyzed locally; the recording is neither committed nor copied into the repository. It shows:

- a thump once per engine cycle, about 10.5 a second (8-12 across the recording);
- an exhaust tone at 97-143 Hz, twice the firing rate of a four-stroke six at those cycle rates (6 firings per cycle), with its own second harmonic;
- energy mostly between 120 and 500 Hz, some up to 2 kHz and almost none above, with a spectral centroid of about 400-800 Hz.

A four-stroke engine completes one cycle (all six firings) every two turns, so `rpm = 120 x cycles/s`, firings/s = `6 x cycles/s`, and a 4 s loop holds `rpm / 30` cycles. Every count below is even, so a 2 s loop would also hold whole cycles at the half-cycle-per-second steps used here (8.5, 9.5, 10.5, 11.5), and the 2 Hz push swell fits 2 s too. The loops stay 4 s because that is the length the owner tuned and approved (it carried over from retuning step 4); it also makes the jitter pattern repeat less often, at twice the file size of 2 s loops. Each level puts its thump rate inside the recording's 8-12 a second; travel level 3 matches the recording's 8-12 s section at 10.5 thumps/s with its tone at 126 Hz and the harmonic at 252 Hz:

| Level | Cycles per 4 s loop | Thumps/s (cycles/s) | rpm | Firings/s | Exhaust tone (2 x firings) |
|---|---|---|---|---|---|
| Idle | 32 | 8 | 960 | 48 | 96 Hz |
| Travel 1-5 | 36, 40, 42, 44, 48 | 9, 10, 10.5, 11, 12 | 1,080-1,440 | 54-72 | 108-144 Hz |
| Push 1-5 | 34, 38, 40, 42, 46 | 8.5, 9.5, 10, 10.5, 11.5 | 1,020-1,380 | 51-69 | 102-138 Hz |

Idle sits 20 % above the assumed 800 rpm and full travel well below the assumed 1,880 rpm high idle. The owner's ear and recording override the spec here; intermediate levels are character choices, not measured engine operating points.

**Track link rate.** The bulldozer drives 3.3 times faster than the real D5 (9 blocks/s against 2.72 m/s, the owner's choice in 0136). A link rate at the in-game speed with a 0.19 m pitch would reach 47 clanks/s per track at top speed, a buzz rather than a clank. The tracks instead sound as the D5's do at the same fraction of top speed: at top forward speed the D5 passes `2.72 / 0.19 = 14.3` links/s per track, so a level at representative speed `v` blocks/s plays `14.3 x v / 9` links/s, rounded to a whole number so the 1 s loop holds whole links.

| Level | Band (blocks/s) | Representative v | 14.3 x v / 9 | Links/s per track |
|---|---|---|---|---|
| 1 | 0.5-2.25 | 1.375 (midpoint) | 2.18 | 2 |
| 2 | 2.25-4 | 3.125 | 4.97 | 5 |
| 3 | 4-5.75 | 4.875 | 7.75 | 8 |
| 4 | 5.75-7.5 | 6.625 | 10.5 | 11 |
| 5 | >= 7.5 | 8.25 (midpoint of 7.5-9) | 13.1 | 13 |

| Short animation name (ce) | Animation id | Effect name | Sound id | WAV | Condition | Volume |
|---|---|---|---|---|---|---|
| `engine_sound_0` | `animation.yasu_ride.bulldozer.engine_sound_0` | `engine_0` | `yasu_ride.bulldozer_engine_0` | `bulldozer_engine_0.wav` | `G && query.ground_speed < 0.5` (unchanged) | 0.5 |
| `engine_sound_1`..`_5` | `...engine_sound_1`..`_5` | `engine_1`..`_5` | `yasu_ride.bulldozer_engine_1`..`_5` | `bulldozer_engine_1`..`_5.wav` | `G && query.property('yasu_ride:blade') >= 0.05 && <band>` | 0.54, 0.58, 0.62, 0.66, 0.7 |
| `push_sound_1`..`_5` | `animation.yasu_ride.bulldozer.push_sound_1`..`_5` | `push_1`..`_5` | `yasu_ride.bulldozer_push_1`..`_5` | `bulldozer_push_1`..`_5.wav` | `G && query.property('yasu_ride:blade') < 0.05 && <band>` | 0.6, 0.65, 0.7, 0.75, 0.8 |
| `track_sound_1`..`_5` | `animation.yasu_ride.bulldozer.track_sound_1`..`_5` | `track_1`..`_5` | `yasu_ride.bulldozer_track_1`..`_5` | `bulldozer_track_1`..`_5.wav` | `G && <band>` | 0.25, 0.3, 0.35, 0.4, 0.45 |
| `hydraulics` | `controller.animation.yasu_ride.bulldozer.hydraulics` | - | - | - | always (an unconditional `animate` entry) | - |
| `hydraulics_sound` | `animation.yasu_ride.bulldozer.hydraulics_sound` | `hydraulics` | `yasu_ride.bulldozer_hydraulics` | `bulldozer_hydraulics.wav` | played by the controller | 0.35 |

`<band>` for level 1 to 5, written exactly as the existing entries do: `query.ground_speed >= 0.5 && query.ground_speed < 2.25`, `>= 2.25 && < 4`, `>= 4 && < 5.75`, `>= 5.75 && < 7.5`, `>= 7.5` (no upper bound). The condition string puts `G` first, then the blade clause, then the speed clause, so `tests/support/soundLevels.ts` `speedRanges` keeps parsing it.

All WAVs go to `packs/yasu_ride_rp/sounds/yasu_ride/`. Every definition uses `"category": "neutral"`. Engine and push: `min_distance` 4.0, `max_distance` 32.0 (a 17 t machine is heard farther than the SUV's 24). Tracks: 4.0 and 24.0. Hydraulics: 2.0 and 16.0. Append the new definitions after `yasu_ride.shower` in `sound_definitions.json`; leave every existing entry unchanged.

The client animate order is form, drive, hydraulics, engine_sound_0 through _5, push_sound_1 through _5, then track_sound_1 through _5. Conditions put G first, then the blade clause when applicable, then speed. Each sound animation fires its matching effect at 0.0; engine and push animations loop for 4.0 s and track animations for 1.0 s, matching their clips; the hydraulics animation runs once for 0.9 s.

Synthesis character values below are chosen by ear against the owner's requests and recording, not measured:

- Engine pulses follow the usual inline-six firing order [1, 5, 3, 6, 2, 4], not checked against Cat's manual. Six cylinder trims (0.8-1.0) repeat each cycle, and the lead cylinder's trim is multiplied by 2.2, so one firing per cycle stands out as the recording's thump. Firing strengths vary by 0.85-1.0. Timing jitter is 4 % of the gap at idle and 2 %-1 % across moving levels. Pulses last 4 ms, or 6 ms under push.
- Exhaust resonances (Hz, Q, gain) are [(65, 3, 0.5), (130, 3, 1.2), (260, 4, 0.65), (420, 4, 0.55), (800, 5, 0.35), (1400, 6, 0.25)], placing the energy where the recording has it: the 130 Hz peak carries the exhaust tone, the 260 Hz peak its harmonic, and the upper peaks the 500 Hz-2 kHz share. Peak-normalize, then tanh with drive 1.6 idle, 1.8 travel, 2.4 push; push adds an 8 % 2 Hz labor swell (8 whole cycles per loop).
- There is no turbo whistle, combustion knock, or intake hiss. A one-pole low-pass at 2500 Hz runs twice, each pass over two copies of the loop so the filter state at the seam matches. The two stages are about -6 dB at 2500 Hz and fall 12 dB/octave above it, so they roll off, rather than remove, what little the drive adds above the recording's range.
- Two track trains have a 0.37-link offset, 5 % jitter, strengths 0.6-1.0, and 4 ms bursts shared at half strength with the thud. Clank resonances are [(520, 12, 0.6), (1150, 18, 0.5), (2300, 22, 0.3), (3700, 25, 0.15)], thud [(90, 3, 0.5)]. Peak-normalize their sum. Squeal uses 40 sines at 1450-1650 Hz, gains [0, 0.03, 0.06, 0.09, 0.12], and 30 % 1 Hz modulation. Roller rumble uses 120 sines at 40-200 Hz with gains [0.1, 0.15, 0.2, 0.25, 0.3].
- Hydraulics, in the spirit of the blade at 8-10 s of https://www.youtube.com/watch?v=faaeGLWSF_8 that the owner pointed to: a pump groan at 190 Hz with 2x and 3x harmonics at 0.6 and 0.35 through tanh drive 1.8, rising 25 % with integrated phase over the 0.5 s the blade moves, with a 40 ms attack and a 30 ms fade after the stop; an oil rush of noise band-passed at 1000 Hz (Q 0.8) under it; at 0.5 s a dull stop clunk, a 6 ms burst ringing at (150, 6, 1.0) and (620, 12, 0.5); and a relief hiss tail, the oil rush decaying with a 0.15 s time constant to the end of the 0.9 s clip.

**Retuning.** The first version followed the spec table: 1 s loops at 7-16 cycles/s (840-1,920 rpm), whistles at 2.1-5.4 kHz, knock, intake hiss, and a 0.5 s pump whine at 380 Hz. The owner listened in game and asked, in order:

1. "Lower the sound and bring the revs down to about 0.3 times"; for the blade, "close to the sound at 8-10 s" of the faaeGLWSF_8 video. The loops became 2 s at about 0.3 times the revs, the exhaust resonances moved down, and the hydraulics became the 0.9 s groan, clunk, and relief hiss, with the pump at 95 Hz.
2. "Remove the high-pitched sounds, and lower the revs more", and "make the blade up/down sound a bit higher". The whistles, knock, and hiss went, a low-pass was added, the revs dropped again, and the pump moved up to 190 Hz.
3. "Base the engine on a diesel engine rather than a two-stroke". Injection clatter and combustion roar were added.
4. "Thicker, do-do-do-do, revs half of now", like 53 s to about 1:10 of the M0yyrtj3rmE video. The engine loop became 4 s with the same cycle counts, halving the revs, with a thud per firing.
5. The owner then supplied their recording of that section. Its analysis showed the "do" is one thump per engine cycle at 8-12 a second, far faster than the per-firing thuds of step 4, so the revs went back up to the table above, the clatter, roar, and thud gave way to the lead-cylinder thump and the recording-shaped resonances, and the cutoff rose to 2500 Hz.

The owner accepted the result ("the sound is OK with this") on 2026-10-24.

Bump the Resource Pack header and module and the Behavior Pack dependency to the next patch above `main` at merge time (0015). No beta API or script changes are needed.

## Consequences

- The Resource Pack gains 17 WAVs, 2,201,338 bytes (about 2.1 MiB) in all: 11 four-second engine and push files of 176,444 bytes, 5 one-second track files of 44,144 bytes, and the 0.9 s hydraulics file of 39,734 bytes.
- The engine steps between levels and follows speed, not throttle (0030, 0060): holding forward against a wall reads as idle.
- Push plays whenever the fully lowered blade moves, including cases where the blade cuts nothing: over air, while reversing, and while turning. The client cannot tell whether a block was cut, and `query.ground_speed` carries neither direction nor steering. Matching push to cutting exactly would need a synced cutting flag set by the script.
- The 4 s engine and push clips lengthen the overlap 0030 describes: Bedrock does not stop a playing clip when its animation stops, so after a speed level change, a blade change, a dismount, or a form change the old clip can play on under the new one for up to 4 s, and speed jitter at a band edge can stack several 4 s copies.
- A pivot in place has ground speed near zero, so tracks are silent even though their animation runs.
- The engine speeds no longer follow the D5's rated or idle rpm. Revisit them against the owner's ear, not the spec, if a later reference replaces the recording.
- The owner's listening check passed on 2026-10-24 on the dev BDS. This ADR stays Proposed because it is accepted together with 0136, and 0136's own manual PC and mobile checks in the Bulldozer section of [the manual checklist](../manual-test.md) are still pending; B18-B22 there describe the final sound.
