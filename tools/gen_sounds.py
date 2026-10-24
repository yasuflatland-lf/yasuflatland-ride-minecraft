"""Synthesize vehicle sounds as 16-bit mono WAV files (ADR 0030).

engine_0 to engine_5: the slow, heavy "dok-dok-dok" of an old single-cylinder diesel (think of a
walk-behind tiller), with its combustion knock and the clank of the crank and connecting rod, at rising
engine speeds; loops played while a rider sits in the vehicle on the ground. The client picks one by
the vehicle's speed.
hover_0 to hover_4: the "shhh" of rushing air, loops played while the vehicle is off the ground,
rising in pitch with the speed. The client picks one by the vehicle's speed.
hover_start: the air swelling in, played once when the wheels start to fold.
sonar: the loop played while a ridden submarine is under water (ADR 0041): a clear sonar ping that rings
out in the water, a faint return from far away, and the low rumble of the deep under both.
boat_engine_0 to boat_engine_7: the sports boat's engine (ADR 0060): the deep, lumpy burble of a
cross-plane V8, its wet exhaust bubbling out under the water, and the hiss of the hull cutting the water,
at rising engine speeds. The client picks one by the boat's speed.
shower: the loop of running water played while the camper's shower runs (ADR 0094).
bulldozer_engine_0 to _5 and bulldozer_push_1 to _5: the Cat D5 six-cylinder diesel at idle (engine_0),
in travel with the blade raised (engine_1 to _5), and pushing with the blade fully lowered (push_1 to
_5). The client picks one by speed and blade (ADR 0140).
bulldozer_track_1 to _5: steel track clank, squeal, and roller rumble following ground speed (ADR 0140).
bulldozer_hydraulics: a half-second blade pump whine, played once per movement (ADR 0140).

Only the standard library is used, and the random generator is seeded, so the output is reproducible.
The loops repeat without a click: the hover loops are sums of sines with whole cycles in the loop, and
the engine loops filter two copies and keep the second, so their ringing wraps around, and the sonar
builds its pings two loops long and folds them onto one.
Each family of sounds has its own seeded generator, so changing one leaves the others as they are.
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 22050
OUT = Path(sys.argv[1]) / "sounds/yasu_ride"
# Power strokes per second of each engine level, from idle to full speed: a four-stroke single fires
# once every 2 turns, so 8 Hz is about 960 rpm and 20 Hz about 2400 rpm. The 1 s loop holds whole strokes.
ENGINE_FIRING_RATES = [8, 10, 12, 14, 17, 20]
ENGINE_LOOP_S = 1.0
# Resonances (Hz, Q, gain) each part of a power stroke rings through: the exhaust's low boom, the
# diesel's combustion knock, and the clank of the crank and connecting rod half a cycle later.
EXHAUST = [(60, 5.0, 1.0), (95, 6.0, 0.8), (180, 4.0, 0.35)]
KNOCK = [(2200, 5.0, 0.3), (3600, 6.0, 0.18)]
CLANK = [(1100, 9.0, 0.16), (2600, 10.0, 0.08)]
# Air noise band (Hz) of each hover level, from hovering in place to full speed.
HOVER_AIR_BANDS = [(700, 2200), (1000, 3000), (1400, 4000), (1900, 5200), (2500, 6500)]
# One ping per loop, a few seconds apart like an active sonar. The ping fades with a 0.7 s time
# constant, about -37 dB after 3 s, so its tail runs past the 4 s seam and wraps around.
SONAR_LOOP_S = 4.0
SONAR_PING_HZ = 1400
SONAR_ATTACK_S = 0.004
SONAR_DECAY_S = 0.7
# Reflections (delay s, gain) that smear the ping into a wet ring, and the return from the target.
SONAR_REFLECTIONS = [(0.11, 0.35), (0.23, 0.25), (0.37, 0.18), (0.52, 0.12)]
SONAR_RETURN = [(1.6, 0.22), (1.73, 0.08)]
SONAR_RETURN_DECAY_S = SONAR_DECAY_S * 0.7
SONAR_RUMBLE_BAND = (30, 120)
# Engine cycles per second of each boat engine level, from idle to full speed. One cycle is two turns
# of the crank, so 6 Hz is 720 rpm and 38 Hz is 4560 rpm; the 1 s loop holds whole cycles.
BOAT_CYCLE_RATES = [6, 9, 13, 17, 22, 27, 32, 38]
BOAT_LOOP_S = 1.0
# Firing order 1-8-4-3-6-5-7-2, one cylinder every 90 degrees of crank, with cylinders 1, 3, 5, and 7
# on the left bank. Each bank's exhaust gets its pulses at uneven gaps, which is the V8 burble.
V8_FIRING_ORDER = [1, 8, 4, 3, 6, 5, 7, 2]
V8_LEFT_BANK = {1, 3, 5, 7}
# Each bank's pipe booms through slightly different resonances, so the two banks beat against each other.
V8_PIPES = [
    [(42, 4.0, 1.0), (88, 5.0, 0.8), (150, 4.0, 0.4), (310, 3.0, 0.15)],
    [(46, 4.0, 1.0), (94, 5.0, 0.8), (165, 4.0, 0.4), (330, 3.0, 0.15)],
]
# Wet exhaust: share of exhaust pulses that blow a bubble out under the water at idle and at full speed,
# and the pitch range (Hz) the bubbles ring at.
BUBBLE_SHARE = (0.6, 0.15)
BUBBLE_PITCH = (70, 220)
# The hull cutting the water: a noise band whose level rises from idle to full speed.
WATER_BAND = (400, 3800)
WATER_GAIN = (0.04, 0.55)
# Running water from the camper's shower head (ADR 0094): a bright hiss band (Hz).
SHOWER_BAND = (1200, 6000)


# Cat C7.1 inline six (D5 Technical Specifications, CGT); the usual inline-six order,
# not checked against Cat's manual. Source: https://www.cgt.it/sites/default/files/d5_technical_specifications_en.pdf
BULLDOZER_FIRING_ORDER = [1, 5, 3, 6, 2, 4]
# Match animation_length in bulldozer.anim.json (2.0 for the engine_sound and push_sound
# clips, 1.0 for track_sound). Cycle counts, links, whistle Hz, and the swell and wobble
# rates below are whole cycles per loop, so changing these breaks the seams.
BULLDOZER_ENGINE_LOOP_S = 2.0
BULLDOZER_TRACK_LOOP_S = 1.0
# Engine cycles per 2 s loop (rpm / 60). The owner heard the spec speeds (7 to 16 cycles/s,
# 840 to 1920 rpm) as too fast and asked twice for slower revs (ADR 0140).
BULLDOZER_IDLE_CYCLES = 3                    # 180 rpm.
BULLDOZER_TRAVEL_CYCLES = [3, 4, 5, 6, 7]    # 180-420 rpm.
BULLDOZER_PUSH_CYCLES = [3, 4, 4, 5, 6]      # 180-360 rpm, lower than travel under load.
# Resonances (Hz, Q, gain) chosen by ear, not measured, against the owner's D5
# references, then lowered after the owner asked for a lower sound (ADR 0140).
BULLDOZER_EXHAUST = [(27, 4.0, 1.0), (53, 5.0, 0.85), (88, 4.0, 0.45), (168, 3.0, 0.2)]
BULLDOZER_ENGINE_CUTOFF_HZ = 400
# Links/s per track: 14.3 * representative game speed / 9, rounded; D5 pitch estimate in ADR 0140.
BULLDOZER_TRACK_LINKS = [2, 5, 8, 11, 13]
# Track resonances, noise bands, and gains chosen by ear, not measured (ADR 0140).
BULLDOZER_TRACK_RING = [(520, 12.0, 0.6), (1150, 18.0, 0.5), (2300, 22.0, 0.3), (3700, 25.0, 0.15)]
BULLDOZER_TRACK_THUD = [(90, 3.0, 0.5)]
BULLDOZER_SQUEAL_BAND = (1450, 1650)
BULLDOZER_SQUEAL_GAIN = [0.0, 0.03, 0.06, 0.09, 0.12]
BULLDOZER_ROLLER_BAND = (40, 200)
BULLDOZER_ROLLER_GAIN = [0.1, 0.15, 0.2, 0.25, 0.3]
# Blade lift: 10 ticks (BULLDOZER_SPEC.bladeLiftTicks, ADR 0138) = 0.5 s.
BULLDOZER_HYDRAULICS_S = 0.5
# The clip runs past the lift for the stop clunk and the relief valve's hiss.
BULLDOZER_HYDRAULICS_TAIL_S = 0.9
# Pump pitch chosen by ear, not measured: the owner heard 380 Hz as too thin and
# 95 Hz as too low (ADR 0140).
BULLDOZER_PUMP_HZ = 190


def write(name, samples):
    peak = max(abs(s) for s in samples) or 1.0
    scale = 0.8 * 32767 / peak
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", round(s * scale)) for s in samples))


def periodic_noise(rng, length_s, lo_hz, hi_hz, count):
    """Band noise as a sum of sines at whole-cycle frequencies, so it loops seamlessly."""
    n = round(RATE * length_s)
    cycles = rng.sample(range(math.ceil(lo_hz * length_s), math.floor(hi_hz * length_s)), count)
    phases = [rng.uniform(0, 2 * math.pi) for _ in cycles]
    w = [2 * math.pi * c / n for c in cycles]
    return [sum(math.sin(wi * i + p) for wi, p in zip(w, phases)) / math.sqrt(count) for i in range(n)]


def bandpass(signal, f, q):
    """RBJ biquad band-pass (constant 0 dB peak gain)."""
    w0 = 2 * math.pi * f / RATE
    alpha = math.sin(w0) / (2 * q)
    a0 = 1 + alpha
    b0, b2 = alpha / a0, -alpha / a0
    a1, a2 = -2 * math.cos(w0) / a0, (1 - alpha) / a0
    x1 = x2 = y1 = y2 = 0.0
    out = []
    for x in signal:
        y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out.append(y)
    return out


def ring(train, resonances):
    """The train rung through each (Hz, Q, gain) band-pass and summed. Filtering two copies and keeping
    the second lets the ringing wrap around the loop seam."""
    n = len(train)
    out = [0.0] * n
    for f, q, gain in resonances:
        rung = bandpass(train + train, f, q)[n:]
        for i in range(n):
            out[i] += gain * rung[i]
    return out


def engine(rng, rate):
    # Each power stroke: a noisy pop that booms through the exhaust, a sharp knock a millisecond later,
    # and a faint clank half a stroke on. At idle the strokes vary and the timing wanders a little; the
    # higher the revs, the steadier the engine runs.
    n = round(RATE * ENGINE_LOOP_S)
    strokes = round(ENGINE_LOOP_S * rate)
    period = n / strokes
    steadiness = ENGINE_FIRING_RATES.index(rate) / (len(ENGINE_FIRING_RATES) - 1)
    pop, knock, clank = ([0.0] * n for _ in range(3))

    def burst(train, at, gain, length_s):
        for j in range(round(length_s * RATE)):
            noise = 1.0 if j < 2 else rng.uniform(-1, 1)
            train[(at + j) % n] += gain * math.exp(-j / (length_s * RATE / 3)) * noise

    for k in range(strokes):
        jitter = rng.uniform(-1, 1) * 0.06 * (1 - steadiness) * period
        at = round(k * period + jitter)
        strength = rng.uniform(0.75 + 0.2 * steadiness, 1.0)
        burst(pop, at, strength, 0.008)
        burst(knock, at + round(0.001 * RATE), strength * rng.uniform(0.7, 1.0), 0.003)
        burst(clank, at + round(period / 2), rng.uniform(0.6, 1.0), 0.002)
    mixed = [a + b + c for a, b, c in zip(ring(pop, EXHAUST), ring(knock, KNOCK), ring(clank, CLANK))]
    peak = max(abs(x) for x in mixed) or 1.0
    return [math.tanh(1.5 * x / peak) for x in mixed]


def hover(rng, band):
    length = 1.0
    n = round(RATE * length)
    air = periodic_noise(rng, length, band[0], band[1], 250)
    # A slow swell keeps the rush from sounding like static.
    return [(1 + 0.12 * math.sin(2 * math.pi * 3 * i / RATE)) * air[i] for i in range(n)]


def hover_start(rng):
    # The air of the slowest level swells in over the 1 s the wheels take to fold (ADR 0022).
    length = 1.0
    n = round(RATE * length)
    lo, hi = HOVER_AIR_BANDS[0]
    air = periodic_noise(rng, length, lo, hi, 250)
    return [(1 - (1 - i / n) ** 3) * air[i] for i in range(n)]


def shower(rng):
    # A bright hiss with a quick flutter, like water drumming on a shower tray; the 1 s loop holds
    # 6 whole flutters, so it repeats without a seam.
    length = 1.0
    n = round(RATE * length)
    spray = periodic_noise(rng, length, SHOWER_BAND[0], SHOWER_BAND[1], 300)
    return [(1 + 0.15 * math.sin(2 * math.pi * 6 * i / n)) * spray[i] for i in range(n)]


def sonar(rng):
    n = round(RATE * SONAR_LOOP_S)
    # Two loops long, then folded, so the ringing that runs past the end comes back in at the start.
    tail = [0.0] * (2 * n)

    def ping(at_s, gain, decay_s):
        # Each copy, the ping included, is detuned by up to 6 Hz, so the copies beat against each
        # other instead of fusing into one steady tone.
        f = SONAR_PING_HZ + rng.uniform(-6, 6)
        start = round(at_s * RATE)
        for j in range(2 * n - start):
            t = j / RATE
            env = min(1.0, t / SONAR_ATTACK_S) * math.exp(-t / decay_s)
            # The envelope starts at 0, so only a fade after the attack ends the ping.
            if t > SONAR_ATTACK_S and env < 1e-4:
                break
            # The second harmonic, with a 0.15 s time constant, gives the onset a harder edge before
            # the pure tone rings on.
            tone = math.sin(2 * math.pi * f * t) + 0.25 * math.exp(-t / 0.15) * math.sin(4 * math.pi * f * t)
            tail[start + j] += gain * env * tone

    ping(0.0, 1.0, SONAR_DECAY_S)
    for at_s, gain in SONAR_REFLECTIONS:
        ping(at_s, gain, SONAR_DECAY_S)
    for at_s, gain in SONAR_RETURN:
        ping(at_s, gain, SONAR_RETURN_DECAY_S)
    rumble = periodic_noise(rng, SONAR_LOOP_S, *SONAR_RUMBLE_BAND, 120)
    # The rumble swells once per loop, so the swell also repeats without a seam.
    return [
        tail[i] + tail[i + n] + 0.35 * (1 + 0.3 * math.sin(2 * math.pi * i / n)) * rumble[i]
        for i in range(n)
    ]


def boat_engine(rng, cycles_hz):
    n = round(RATE * BOAT_LOOP_S)
    cycles = round(BOAT_LOOP_S * cycles_hz)
    gap = n / (cycles * len(V8_FIRING_ORDER))
    # 0 at idle, 1 at full speed: idle runs rough and bubbles a lot, full speed is steady and hisses
    t = BOAT_CYCLE_RATES.index(cycles_hz) / (len(BOAT_CYCLE_RATES) - 1)
    banks = [[0.0] * n, [0.0] * n]
    bubbles = [0.0] * n

    def pop(train, at, gain):
        length = round(0.006 * RATE)
        for j in range(length):
            noise = 1.0 if j < 2 else rng.uniform(-1, 1)
            train[(at + j) % n] += gain * math.exp(-j / (length / 3)) * noise

    def bubble(at, gain):
        # A bubble rings as a damped sine whose pitch rises as it shrinks toward the surface
        f0 = rng.uniform(*BUBBLE_PITCH)
        decay = rng.uniform(0.02, 0.05)
        phase = 0.0
        for j in range(round(4 * decay * RATE)):
            s = j / RATE
            phase += 2 * math.pi * f0 * (1 + 1.5 * s / decay) / RATE
            bubbles[(at + j) % n] += gain * math.exp(-s / decay) * math.sin(phase)

    share = BUBBLE_SHARE[0] + (BUBBLE_SHARE[1] - BUBBLE_SHARE[0]) * t
    for k in range(cycles * len(V8_FIRING_ORDER)):
        cylinder = V8_FIRING_ORDER[k % len(V8_FIRING_ORDER)]
        jitter = rng.uniform(-1, 1) * 0.08 * (1 - t) * gap
        at = round(k * gap + jitter)
        strength = rng.uniform(0.7 + 0.25 * t, 1.0)
        pop(banks[0 if cylinder in V8_LEFT_BANK else 1], at, strength)
        if rng.random() < share:
            bubble(at + round(rng.uniform(0.005, 0.02) * RATE), strength * rng.uniform(0.3, 0.8))
    rumble = [a + b for a, b in zip(ring(banks[0], V8_PIPES[0]), ring(banks[1], V8_PIPES[1]))]
    peak = max(abs(x) for x in rumble) or 1.0
    rumble = [math.tanh(1.8 * x / peak) for x in rumble]
    bubble_peak = max(abs(x) for x in bubbles) or 1.0
    water = periodic_noise(rng, BOAT_LOOP_S, *WATER_BAND, 300)
    water_gain = WATER_GAIN[0] + (WATER_GAIN[1] - WATER_GAIN[0]) * t
    # The water swells twice a loop, so the hiss is not static and still repeats without a seam
    return [
        rumble[i]
        + 0.45 * (1 - 0.5 * t) * bubbles[i] / bubble_peak
        + water_gain * (1 + 0.2 * math.sin(4 * math.pi * i / n)) * water[i]
        for i in range(n)
    ]


def loop_lowpass(signal, cutoff_hz):
    """One-pole low-pass run over the loop twice, so the filter state at the seam matches."""
    a = 1 - math.exp(-2 * math.pi * cutoff_hz / RATE)
    y = 0.0
    for x in signal:
        y += a * (x - y)
    out = []
    for x in signal:
        y += a * (x - y)
        out.append(y)
    return out


def bulldozer_engine(rng, cycles, load, t):
    n = round(RATE * BULLDOZER_ENGINE_LOOP_S)
    trims = [rng.uniform(0.88, 1.0) for _ in BULLDOZER_FIRING_ORDER]
    exhaust = [0.0] * n
    gap = n / (cycles * 6)
    # Pulse widths, timing variation, drive, and swell are character values chosen by ear
    # against the D5 references, not measurements (ADR 0140).
    jitter_share = 0.04 if load == "idle" else 0.02 - 0.01 * t
    drive = {"idle": 1.4, "travel": 1.6, "push": 2.2}[load]
    pulse_s = 0.030 if load == "push" else 0.024

    for k in range(cycles * 6):
        cylinder = BULLDOZER_FIRING_ORDER[k % 6]
        at = round(k * gap + rng.uniform(-1, 1) * jitter_share * gap)
        strength = trims[cylinder - 1] * rng.uniform(0.85, 1.0)
        length = round(pulse_s * RATE)
        for j in range(length):
            noise = 1.0 if j < 2 else rng.uniform(-1, 1)
            exhaust[(at + j) % n] += strength * noise * math.exp(-j / (length / 3))
    mixed = ring(exhaust, BULLDOZER_EXHAUST)
    peak = max(abs(x) for x in mixed) or 1.0
    mixed = [math.tanh(drive * x / peak) for x in mixed]
    if load == "push":
        mixed = [x * (1 + 0.08 * math.sin(2 * math.pi * 2 * BULLDOZER_ENGINE_LOOP_S * i / n)) for i, x in enumerate(mixed)]
    # The owner asked for no high-pitched sound: no turbo whistle, knock, or hiss, and the
    # overtones the drive adds are cut above BULLDOZER_ENGINE_CUTOFF_HZ (ADR 0140).
    mixed = loop_lowpass(loop_lowpass(mixed, BULLDOZER_ENGINE_CUTOFF_HZ), BULLDOZER_ENGINE_CUTOFF_HZ)
    peak = max(abs(x) for x in mixed) or 1.0
    return [x / peak for x in mixed]


def bulldozer_track(rng, level):
    n = round(RATE * BULLDOZER_TRACK_LOOP_S)
    clank, thud = ([0.0] * n for _ in range(2))
    links = BULLDOZER_TRACK_LINKS[level]
    gap = n / links
    # Offset, jitter, strength, burst length, and modulation chosen by ear, not measured (ADR 0140).
    for offset in [0.0, 0.37]:
        for k in range(links):
            at = round((k + offset + rng.uniform(-0.05, 0.05)) * gap)
            strength = rng.uniform(0.6, 1.0)
            length = round(0.004 * RATE)
            for j in range(length):
                noise = 1.0 if j < 2 else rng.uniform(-1, 1)
                sample = strength * noise * math.exp(-j / (length / 3))
                clank[(at + j) % n] += sample
                thud[(at + j) % n] += 0.5 * sample
    mixed = [a + b for a, b in zip(ring(clank, BULLDOZER_TRACK_RING), ring(thud, BULLDOZER_TRACK_THUD))]
    peak = max(abs(x) for x in mixed) or 1.0
    squeal = periodic_noise(rng, BULLDOZER_TRACK_LOOP_S, *BULLDOZER_SQUEAL_BAND, 40)
    roller = periodic_noise(rng, BULLDOZER_TRACK_LOOP_S, *BULLDOZER_ROLLER_BAND, 120)
    return [
        mixed[i] / peak
        + BULLDOZER_SQUEAL_GAIN[level] * (1 + 0.3 * math.sin(2 * math.pi * i / n)) * squeal[i]
        + BULLDOZER_ROLLER_GAIN[level] * roller[i]
        for i in range(n)
    ]


def bulldozer_hydraulics(rng):
    n = round(RATE * BULLDOZER_HYDRAULICS_TAIL_S)
    lift = round(RATE * BULLDOZER_HYDRAULICS_S)
    # Groan, oil rush, clunk, and envelope chosen by ear, not measured (ADR 0140): the
    # pump strains and the oil rushes while the blade moves, then the blade stops with a
    # dull clunk and the relief valve hisses out.
    rush = bandpass([rng.uniform(-1, 1) for _ in range(n)], 1000, 0.8)
    clunk = [0.0] * n
    for j in range(round(0.006 * RATE)):
        clunk[lift + j] = (1.0 if j < 2 else rng.uniform(-1, 1)) * math.exp(-j / (0.002 * RATE))
    clunk = ring(clunk, [(150, 6.0, 1.0), (620, 12.0, 0.5)])
    peak = max(abs(x) for x in clunk) or 1.0
    phase = 0.0
    out = []
    for i in range(n):
        moving = min(1.0, i / (0.04 * RATE)) * (1.0 if i < lift else math.exp(-(i - lift) / (0.03 * RATE)))
        phase += 2 * math.pi * BULLDOZER_PUMP_HZ * (1 + 0.25 * min(i, lift) / lift) / RATE
        groan = math.tanh(1.8 * (math.sin(phase) + 0.6 * math.sin(2 * phase) + 0.35 * math.sin(3 * phase)))
        relief = 0.0 if i < lift else math.exp(-(i - lift) / (0.15 * RATE))
        out.append(0.7 * moving * groan + (0.35 * moving + 0.25 * relief) * rush[i] + 0.8 * clunk[i] / peak)
    peak = max(abs(x) for x in out) or 1.0
    return [x / peak for x in out]


rng = random.Random(29)
for level, rate in enumerate(ENGINE_FIRING_RATES):
    write(f"engine_{level}", engine(rng, rate))
rng = random.Random(30)
for level, band in enumerate(HOVER_AIR_BANDS):
    write(f"hover_{level}", hover(rng, band))
write("hover_start", hover_start(rng))
rng = random.Random(40)
write("sonar", sonar(rng))
rng = random.Random(60)
for level, rate in enumerate(BOAT_CYCLE_RATES):
    write(f"boat_engine_{level}", boat_engine(rng, rate))
rng = random.Random(70)
write("shower", shower(rng))
rng = random.Random(140)
write("bulldozer_engine_0", bulldozer_engine(rng, BULLDOZER_IDLE_CYCLES, "idle", 0.0))
for level, cycles in enumerate(BULLDOZER_TRAVEL_CYCLES):
    write(f"bulldozer_engine_{level + 1}", bulldozer_engine(rng, cycles, "travel", level / 4))
for level, cycles in enumerate(BULLDOZER_PUSH_CYCLES):
    write(f"bulldozer_push_{level + 1}", bulldozer_engine(rng, cycles, "push", level / 4))
rng = random.Random(141)
for level in range(len(BULLDOZER_TRACK_LINKS)):
    write(f"bulldozer_track_{level + 1}", bulldozer_track(rng, level))
rng = random.Random(142)
write("bulldozer_hydraulics", bulldozer_hydraulics(rng))
print("wrote", ", ".join(sorted(p.name for p in OUT.glob("*.wav"))))
