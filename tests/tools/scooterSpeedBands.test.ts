import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("keeps six contiguous speed bands aligned with the shipped engine and exhaust gates", () => {
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
sound = load_tool('scooter_sound')
bands = sound.SPEED_BANDS
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
         for name, condition in entry.items() if name.startswith(('engine_sound_', 'exhaust_'))}
assert len(gates) == 2 * len(bands)
for band in bands:
    assert sound.ENGINE_CLIPS[band.index].index == band.index
    assert sound.band_condition(band) == gates[f'engine_sound_{band.index}']
    assert gates[f'exhaust_{band.index}'] == gates[f'engine_sound_{band.index}']
`,
    ],
    { encoding: "utf8" },
  );
});
