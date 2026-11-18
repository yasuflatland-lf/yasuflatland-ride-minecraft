import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

// These lists preserve the manifest before the per-scene split (#1877).
const oldOutputs = [
  "docs/images/suv-*.png",
  "docs/images/sportsboat-*.png",
  "docs/images/scooter-*.png",
  "docs/images/camper-*.png",
  "docs/images/bulldozer-*.png",
  "docs/images/items/camping-gear/*.png",
  "packs/yasu_ride_rp/pack_icon.png",
  "packs/yasu_ride_bp/pack_icon.png",
  "packs/yasu_ride_test_bp/pack_icon.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/potted_plant.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/macrame_planter.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/cactus_pot.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/percolator.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/enamel_kettle.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/saucepan.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/mug_pair.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/sugar_pot.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/fruit_bowl.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/toaster.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/transistor_radio.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/book_stack.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/road_map.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/photo_frame.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/cushion.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/tissue_box.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/desk_fan.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/alarm_clock.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/instant_camera.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/binoculars.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/beach_parasol_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/beach_chair_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/dining_table_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/dining_chair_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/sofa_single_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/sofa_double_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/toilet_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/washstand_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/noga_chair_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/low_chair_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/tent_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/roof_tent_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/camp_table_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/fire_pit_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/dutch_oven_item.png",
  "packs/yasu_ride_rp/textures/items/yasu_ride/gas_lantern_item.png",
];
const oldReads = [
  "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/sportsboat.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/scooter.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/bulldozer.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/low_chair.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/noga_chair.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/tent.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/roof_tent.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/camp_table.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/fire_pit.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/dutch_oven.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/gas_lantern.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/beach_parasol.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/beach_chair.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/dining_table.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/dining_chair.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/sofa_single.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/sofa_double.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/toilet.geo.json",
  "packs/yasu_ride_rp/models/entity/yasu_ride/washstand.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/potted_plant.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/macrame_planter.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/cactus_pot.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/percolator.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/enamel_kettle.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/saucepan.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/mug_pair.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/sugar_pot.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/fruit_bowl.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/toaster.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/transistor_radio.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/book_stack.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/road_map.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/photo_frame.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/cushion.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/tissue_box.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/desk_fan.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/alarm_clock.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/instant_camera.geo.json",
  "packs/yasu_ride_rp/models/blocks/yasu_ride/binoculars.geo.json",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/suv.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/sportsboat.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/scooter_fixed.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/camper.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/bulldozer.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/low_chair.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/noga_chair.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/tent.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/roof_tent.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/camp_table.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/fire_pit.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/dutch_oven.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/gas_lantern.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/beach_parasol.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/beach_chair.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/dining_table.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/dining_chair.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/sofa_single.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/toilet.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/washstand.png",
  "packs/yasu_ride_rp/textures/entity/yasu_ride/suv_lit.png",
  "packs/yasu_ride_rp/textures/blocks/yasu_ride/camping_gear.png",
  "packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json",
  "packs/yasu_ride_rp/animations/yasu_ride/beach_chair.anim.json",
  "packs/yasu_ride_rp/animations/yasu_ride/toilet.anim.json",
  "packs/yasu_ride_rp/manifest.json",
  "packs/yasu_ride_bp/manifest.json",
  "packs/yasu_ride_test_bp/manifest.json",
];

it("partitions the original preview outputs and preserves all reads", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import json, fnmatch, sys
sys.path.insert(0, 'tools')
from run_generators import matching_paths
plan = json.load(open('tools/generators.json'))
entries = [e for e in plan['generators'] if e['script'] == 'render_preview.py']
scenes = ['suv', 'boat', 'camper', 'bulldozer', 'scooter', 'gear']
assert [e.get('id') for e in entries] == ['render_preview.py:' + s for s in scenes]
old_outputs, old_reads = json.loads(sys.argv[1])
assert {p for e in entries for p in e['outputs']} == set(old_outputs)
assert {p for e in entries for p in e['reads']} == set(old_reads) | {'packs/yasu_ride_rp/textures/entity/yasu_ride/scooter_paint.png', 'packs/yasu_ride_rp/models/entity/yasu_ride/scooter_paint.geo.json', 'packs/yasu_ride_rp/textures/entity/yasu_ride/scooter_lit.png', 'packs/yasu_ride_rp/models/entity/yasu_ride/scooter_lit.geo.json'}
vehicle_reads = {
    'suv': ['models/entity/yasu_ride/suv.geo.json', 'textures/entity/yasu_ride/suv.png',
            'textures/entity/yasu_ride/suv_lit.png', 'animations/yasu_ride/suv.anim.json'],
    'boat': ['models/entity/yasu_ride/sportsboat.geo.json', 'textures/entity/yasu_ride/sportsboat.png'],
    'camper': ['models/entity/yasu_ride/camper.geo.json', 'textures/entity/yasu_ride/camper.png'],
    'bulldozer': ['models/entity/yasu_ride/bulldozer.geo.json', 'textures/entity/yasu_ride/bulldozer.png'],
    'scooter': ['models/entity/yasu_ride/scooter_paint.geo.json', 'textures/entity/yasu_ride/scooter_paint.png', 'models/entity/yasu_ride/scooter.geo.json', 'models/entity/yasu_ride/scooter_lit.geo.json', 'textures/entity/yasu_ride/scooter_fixed.png',
                'textures/entity/yasu_ride/scooter_lit.png'],
}
manifest_reads = {p for p in old_reads if p.endswith('/manifest.json')}
vehicle_paths = {'packs/yasu_ride_rp/' + p for paths in vehicle_reads.values() for p in paths}
for entry, scene in zip(entries, scenes):
    expected = ({'packs/yasu_ride_rp/' + p for p in vehicle_reads[scene]} | manifest_reads
                if scene != 'gear' else set(old_reads) - vehicle_paths)
    assert set(entry['reads']) == expected, scene
    assert entry['args'][-2:] == ['--scene', scene]
    assert entry['tracked'] and entry['afterGenerators']
    assert entry['after'] == entries[0]['after']
scooter = next(e for e in entries if e['id'] == 'render_preview.py:scooter')
expected_scooter = {'docs/images/scooter-' + name + '.png' for name in (
    'front-left', 'flying-headlights', 'side', 'rear', 'floor')}
assert set(matching_paths(scooter['outputs'])) == expected_scooter
for path in old_outputs + matching_paths(old_outputs):
    assert sum(fnmatch.fnmatchcase(path, p) for e in entries for p in e['outputs']) == 1, path
`,
    JSON.stringify([oldOutputs, oldReads]),
  ]);
});

it("never assigns sample preview and icon paths to multiple scenes", async () => {
  const worker = startPythonWorker();
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...oldOutputs),
        fc.stringMatching(/^[a-z_/-]{1,40}$/),
        async (pattern, suffix) => {
          await worker.run(
            `
import fnmatch, json, sys
entries = json.load(open('tools/generators.json'))['generators']
path = json.load(sys.stdin)
owners = [e for e in entries if e['script'] == 'render_preview.py'
          for p in e['outputs'] if fnmatch.fnmatchcase(path, p)]
assert len(owners) == 1, path
`,
            JSON.stringify(pattern.replaceAll("*", suffix)),
          );
        },
      ),
    );
  } finally {
    await worker.close();
  }
});

it("selects any subset once, bypasses dependencies, and checks exactly its ownership", async () => {
  const worker = startPythonWorker();
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            "suv",
            "boat",
            "camper",
            "bulldozer",
            "scooter",
            "gear",
          ),
          { minLength: 1, maxLength: 12 },
        ),
        fc.boolean(),
        async (scenes, check) => {
          await worker.run(
            `
import json, sys
from unittest.mock import patch
sys.path.insert(0, 'tools')
import run_generators as runner
names, check = json.load(sys.stdin)
ids = ['render_preview.py:' + name for name in names]
entries = json.loads(runner.PLAN.read_text())['generators']
expected = [e for e in entries if e.get('id') in ids]
with patch.object(sys, 'argv', ['run_generators.py', '--only', *ids] + (['--check'] if check else [])), \
     patch.object(runner, 'run_parallel') as run, \
     patch.object(runner.OutputManifest, 'ownership_errors', return_value=[]) as ownership, \
     patch.object(runner, 'generation_status', side_effect=AssertionError('partial run accessed stamp')), \
     patch.object(runner.Path, 'unlink', side_effect=AssertionError('partial run removed stamp')):
    runner.main()
assert run.call_count == 1
assert run.call_args.args[:2] == ([{**e, 'after': []} for e in expected], check)
assert ownership.call_args.kwargs == {'generators': [e['id'] for e in expected]}
`,
            JSON.stringify([scenes, check]),
          );
        },
      ),
    );
  } finally {
    await worker.close();
  }
});
