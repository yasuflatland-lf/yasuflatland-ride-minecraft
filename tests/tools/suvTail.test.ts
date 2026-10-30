import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("keeps the tail frame, chamfer and lower lens dark around two red bars and a square reverse lamp", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
tail = load_tool('suv_paint_tail')
palette = load_tool('suv_palette')
paint = palette.BODY_PAINTS[0]
assert [(r.name, r.w, r.h, r.base) for r in tail.REGIONS] == [
    ('tail_face', 12, 24, 'tail'), ('third_brake', 12, 3, 'tail')]
for v in range(24):
    for u in range(12):
        frame = u in (0, 11) or v in (0, 23)
        chamfer = u - v >= 9
        bar = 2 <= u < 10 and (2 <= v < 4 or 5 <= v < 7)
        reverse = 3 <= u < 9 and 9 <= v < 15
        expected = not (frame or chamfer) and (bar or reverse)
        assert tail.lit('tail_face', u, v) == expected
        color = tail.color('tail_face', u, v, paint)
        assert color[3] == 255
        if chamfer: assert color[:3] == palette.PALETTE['resin']
        elif frame: assert color[0] < palette.PALETTE['tail'][0]
        elif reverse: assert min(color[:3]) >= 200
        elif bar: assert color[0] > palette.PALETTE['tail'][0] and color[0] > color[1]
        else: assert color[:3] == palette.PALETTE['tail']
        assert tail.mer('tail_face', u, v, paint) is None
for v in range(3):
    for u in range(12):
        assert tail.lit('third_brake', u, v)
        assert tail.color('third_brake', u, v, paint) == tail.color('tail_face', 2, 2, paint)
        assert tail.mer('third_brake', u, v, paint) is None`,
  ]);
});
