import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// A reference encoder written independently of tools/texture_io.py: filter 0 on every row,
// RGB files drop the alpha byte.
const script = [
  "import sys, struct, zlib, tempfile",
  "sys.path.insert(0, 'tools')",
  "from pathlib import Path",
  "import texture_io",
  "def reference(w, h, px, rgb, level):",
  "    step = 3 if rgb else 4",
  "    raw = b''.join(b'\\x00' + b''.join(bytes(px[(y * w + x) * 4:(y * w + x) * 4 + step]) for x in range(w)) for y in range(h))",
  "    chunk = lambda k, p: struct.pack('>I', len(p)) + k + p + struct.pack('>I', zlib.crc32(k + p) & 0xFFFFFFFF)",
  "    head = struct.pack('>IIBBBBB', w, h, 8, 2 if rgb else 6, 0, 0, 0)",
  "    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', head) + chunk(b'IDAT', zlib.compress(raw, level)) + chunk(b'IEND', b'')",
  "directory = Path(tempfile.mkdtemp())",
  "results = []",
  "for w, h in [(1, 1), (3, 5), (33, 7)]:",
  "    for rgb in (False, True):",
  "        px = bytes((i * 37 + w) % 251 if (rgb is False or i % 4 != 3) else 255 for i in range(w * h * 4))",
  "        path = directory / f'{w}x{h}{int(rgb)}.png'",
  "        texture_io.Outputs(False).rgba(path, w, h, px, rgb=rgb)",
  "        same = path.read_bytes() == reference(w, h, px, rgb, 9)",
  "        fresh = texture_io.Outputs(True)",
  "        fresh.rgba(path, w, h, px, rgb=rgb)",
  "        changed = bytearray(px); changed[0] ^= 1",
  "        stale = texture_io.Outputs(True)",
  "        stale.rgba(path, w, h, bytes(changed), rgb=rgb)",
  "        results.append((same, not fresh.stale, bool(stale.stale)))",
  "print(results)",
].join("\n");

describe("Outputs.rgba", () => {
  it("writes the reference PNG bytes and compares decoded pixels", () => {
    const out = execFileSync("python3", ["-I", "-c", script], {
      encoding: "utf8",
    });
    expect(out.trim()).toBe(
      `[${Array(6).fill("(True, True, True)").join(", ")}]`,
    );
  });
});
