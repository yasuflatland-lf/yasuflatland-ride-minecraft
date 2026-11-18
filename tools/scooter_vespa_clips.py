"""Cut the owner's Vespa recordings into six unreferenced engine loops.

Run by hand with FFmpeg 9.0.2; the private MP3s are never generator inputs.
Rev bands use distinct windows ordered by measured spectral brightness as a
relative rev proxy, not calibrated RPM. Measurements below are mean mono
aspectralstats centroids and per-frame astats RMS over length + fade seconds
(8192-sample spectral windows, no overlap, at 48 kHz).
The owner supplied idoling.mp3 (8.088 s) and reving.mp3 (14.640 s) on
2026-11-18. Exclude the falling rev at 2.0–4.0 s: the mean centroid drops
from 1879 Hz over 2.0–4.25 s to 1598 Hz over 4.0–6.25 s. Overlapping
post-drop windows retain the rising rev without including that fall.
Idle uses the steady 4.0–6.25 s region rather than the full recording,
keeping the output within the pack's 2–6 second duration contract.

Normalize RMS to -21 dBFS + 0.2 dB per band: a 1 dB intended total rise.
A -2 dBFS pre-encode peak ceiling leaves headroom for Vorbis overshoot.
"""

import argparse
import math
import shutil
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass(frozen=True)
class SliceSpec:
    source: Literal["idle", "rev"]
    start: float
    length: float
    fade: float


SCOOTER_ENGINE_SLICES: tuple[SliceSpec, ...] = (
    SliceSpec("idle", 4.0, 2.0, 0.25),  # Idle: 2167 Hz centroid, -29.84 dBFS RMS.
    SliceSpec("rev", 4.0, 2.0, 0.25),  # Low rev: 1598 Hz, -21.86 dBFS.
    SliceSpec("rev", 5.0, 2.0, 0.25),  # Early rise: 1644 Hz, -21.85 dBFS.
    SliceSpec("rev", 6.0, 2.0, 0.25),  # Middle rise: 1701 Hz, -21.98 dBFS.
    SliceSpec("rev", 6.5, 2.0, 0.25),  # Upper rise: 1721 Hz, -21.81 dBFS.
    SliceSpec("rev", 7.0, 2.0, 0.25),  # High rev: 1760 Hz, -21.88 dBFS.
)

RATE = 48000


def crossfade_plan(length: float, fade: float) -> tuple[float, float]:
    """Read an extra seam tail, folding it onto the head of an exact loop."""
    if not math.isfinite(length) or not math.isfinite(fade):
        raise ValueError("Loop length and fade must be finite")
    if length <= 0 or fade < 0 or fade > length / 2:
        raise ValueError("Require length > 0 and 0 <= fade <= length / 2")
    return length + fade, length


def run_ffmpeg(ffmpeg: str, args: list[str], data: bytes | None = None) -> bytes:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", *args],
        input=data, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip())
    return result.stdout


def write_clip(ffmpeg: str, source: Path, out: Path, band: int, spec: SliceSpec):
    window, length = crossfade_plan(spec.length, spec.fade)
    samples = round(length * RATE)
    fade = round(spec.fade * RATE)
    if fade:
        # Put the tail-to-head blend first; the end then meets its original
        # continuation at the next loop's start, rather than jumping to silence.
        graph = (
            "[0:a]aformat=channel_layouts=mono,aresample=48000,"
            "asplit=3[h][b][t];"
            f"[h]atrim=end_sample={fade},asetpts=PTS-STARTPTS[head];"
            f"[b]atrim=start_sample={fade}:end_sample={samples},"
            "asetpts=PTS-STARTPTS[body];"
            f"[t]atrim=start_sample={samples}:end_sample={samples + fade},"
            "asetpts=PTS-STARTPTS[tail];"
            f"[tail][head]acrossfade=ns={fade}:c1=qsin:c2=qsin[seam];"
            "[seam][body]concat=n=2:v=0:a=1[out]"
        )
    else:
        graph = (
            "[0:a]aformat=channel_layouts=mono,aresample=48000,"
            f"atrim=end_sample={samples}[out]"
        )
    pcm = run_ffmpeg(ffmpeg, [
        "-ss", str(spec.start), "-t", str(window), "-i", str(source),
        "-filter_complex", graph, "-map", "[out]", "-f", "f32le", "pipe:1",
    ])
    if len(pcm) != samples * 4:
        raise ValueError(f"Source is too short for band {band}: {source}")
    values = struct.unpack(f"<{samples}f", pcm)
    rms = math.sqrt(sum(x * x for x in values) / samples)
    peak = max(abs(x) for x in values)
    if rms == 0:
        raise ValueError(f"Silent source for band {band}: {source}")
    target = 10 ** ((-21 + 0.2 * band) / 20)
    gain = min(target / rms, 10 ** (-2 / 20) / peak)
    run_ffmpeg(ffmpeg, [
        "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
        "-af", f"volume={gain:.12f}", "-c:a", "libvorbis", "-q:a", "5",
        str(out),
    ], pcm)
    print(f"{out.name}: {length:.3f} s")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--idle", type=Path, required=True)
    parser.add_argument("--rev", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        parser.error("ffmpeg was not found on PATH; add FFmpeg to PATH first")
    for path in (args.idle, args.rev):
        if not path.is_file():
            parser.error(f"Source file does not exist: {path}")
    args.out.mkdir(parents=True, exist_ok=True)
    try:
        for band, spec in enumerate(SCOOTER_ENGINE_SLICES):
            source = args.idle if spec.source == "idle" else args.rev
            write_clip(ffmpeg, source, args.out / f"scooter_engine_{band}.ogg", band, spec)
    except (RuntimeError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
