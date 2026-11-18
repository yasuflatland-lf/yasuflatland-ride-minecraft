"""Cut private Vespa recordings; rev clips overlap their one-second animation.

Rev bands are raw cuts without edge fades or a tail-to-head crossfade.
The overlap NCC/envelope search and decoded summed levels are documented in
sounds.md. Idle retains its approved crossfade and bytes. Run by hand;
private MP3s are never generator inputs.
"""

import argparse
import math
import shutil
import struct
import sys
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

sound = load_tool("scooter_sound")


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
    # Raw head/tail NCC: 0.91046, 0.89641, 0.86421, 0.91896, 0.86716.
    # 5 ms envelope NMSE <0.04 screens firing-phase mismatches; see sounds.md.
    SliceSpec("rev", 4.4915625, sound.ENGINE_CLIPS[1].seconds, 0),
    SliceSpec("rev", 6.923, sound.ENGINE_CLIPS[2].seconds, 0),
    SliceSpec("rev", 8.555, sound.ENGINE_CLIPS[3].seconds, 0),
    SliceSpec("rev", 10.303, sound.ENGINE_CLIPS[4].seconds, 0),
    SliceSpec("rev", 13.523, sound.ENGINE_CLIPS[5].seconds, 0),
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
    window, length = crossfade_plan(
        spec.length + (sound.ENGINE_OVERLAP_SECONDS if band else 0), spec.fade
    )
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
            f"atrim=start_sample={round(spec.start * RATE)}:"
            f"end_sample={round(spec.start * RATE) + samples},asetpts=PTS-STARTPTS[out]"
        )
    # Decode rev sources from the beginning: MP3 input seeking can shift the
    # selected waveform away from the sample positions used by the search.
    input_args = (["-ss", str(spec.start), "-t", str(window)] if band == 0 else [])
    pcm = run_ffmpeg(ffmpeg, [
        *input_args, "-i", str(source),
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
    # Coherent overlap adds nearly 6 dB locally; reserve 4.5 dB relative to
    # the former single-instance targets, plus a summed pre-encode ceiling.
    if band:
        target *= 10 ** (-4.5 / 20)
    gain = min(target / rms, 10 ** ((-8 if band else -2) / 20) / peak)
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
