import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("keeps six contiguous immutable speed bands aligned with the shipped engine gates", () => {
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import json, sys
from dataclasses import FrozenInstanceError
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
sound = load_tool('scooter_sound')
assert hasattr(sound, 'SPEED_BANDS'), 'Missing shared speed bands'
bands = sound.SPEED_BANDS
assert isinstance(bands, tuple)
assert len(bands) == 6
assert bands[0].lower == 0
assert bands[-1].upper is None
assert [band.index for band in bands] == list(range(6))
for previous, current in zip(bands, bands[1:]):
    assert previous.lower < current.lower
    assert previous.upper == current.lower
entity = json.loads(Path('packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json').read_text())
animate = entity['minecraft:client_entity']['description']['scripts']['animate']
gates = {name: condition for entry in animate if isinstance(entry, dict)
         for name, condition in entry.items() if name.startswith('engine_sound_')}
assert len(gates) == len(bands)
for band in bands:
    assert isinstance(band, sound.SpeedBand)
    assert sound.ENGINE_CLIPS[band.index].index == band.index
    assert sound.band_condition(band) == gates[f'engine_sound_{band.index}']
    try:
        band.lower = -1
    except FrozenInstanceError:
        pass
    else:
        raise AssertionError('Speed bands must be immutable')
`,
    ],
    { encoding: "utf8" },
  );
});
