"""Cut the owner's Vespa recordings into six unreferenced engine loops.

Run by hand with FFmpeg 9.0.2; the private MP3s are never generator inputs.
Rev bands use post-drop windows with increasing decoded
fundamentals. All six seams use the beat-aligned waveform/envelope search
recorded in docs/specs/sounds.md. Rev search regions span 4.0–14.6 s,
excluding the falling rev at 2.0–4.0 s. Search exactly 20 ticks
(48000 samples), refining the waveform/envelope/beat score within each
band's region and choosing the smallest decoded 100 ms RMS spread among
candidates passing verification: wrap gap inside the internal spread and
within 10 ms of its median, endpoint jump below the local adjacent-difference
99th percentile, and <=3 Hz fundamental drift between the first and last 0.5 s.
The 3 Hz bound limits measured drift; it is not a listening result.
Idle is unchanged; private MP3s are never generator inputs.

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
    # Search score = waveform NMSE + envelope NMSE + 10 * relative beat error:
    # 0.246560 + 0.092780 + 10 * 0.019697 = 0.536310. Source wrap gap
    # 112.167 ms vs 110 ms median; decoded wrap 112.167 ms (see sounds spec).
    SliceSpec("idle", 4.289833, 2.226167, 0.03),
    SliceSpec("rev", 4.831979166666667, 1.0, 0.02),
    SliceSpec("rev", 6.351354166666667, 1.0, 0.02),
    SliceSpec("rev", 7.386, 1.0, 0.02),
    SliceSpec("rev", 10.895958333333333, 1.0, 0.02),
    SliceSpec("rev", 13.459979166666667, 1.0, 0.02),
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
    # Short pages preserve the initial samples when decoding one-second Vorbis.
    run_ffmpeg(ffmpeg, [
        "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
        "-af", f"volume={gain:.12f}", "-c:a", "libvorbis", "-q:a", "5",
        "-page_duration", "20000",
        str(out),
    ], pcm)
    # Vorbis end trimming is carried by the final page granule, not packet size.
    data = out.read_bytes()
    offset = 0
    granule = -1
    while offset < len(data):
        if offset + 27 > len(data) or data[offset:offset + 5] != b"OggS\x00":
            raise ValueError(f"Invalid Ogg page: {out}")
        body = offset + 27 + data[offset + 26]
        if body > len(data):
            raise ValueError(f"Truncated Ogg page: {out}")
        end = body + sum(data[offset + 27:body])
        if end > len(data):
            raise ValueError(f"Truncated Ogg body: {out}")
        granule = struct.unpack_from("<q", data, offset + 6)[0]
        offset = end
    decoded = run_ffmpeg(ffmpeg, [
        "-i", str(out), "-f", "f32le", "pipe:1",
    ])
    if granule != samples or len(decoded) != samples * 4:
        raise ValueError(f"Vorbis duration changed for band {band}: {out}")
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
