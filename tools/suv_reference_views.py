"""Compare external SUV reference photos with views of the resource-pack model."""
import argparse
import sys
from pathlib import Path
from typing import NamedTuple

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_preview as renderer


class View(NamedTuple):
    view: tuple[float, float, float]
    screen_up: tuple[float, float, float] | None
    flip: bool = False


REFERENCE_VIEWS: dict[str, View] = {
    "rubicon_front.png": View((0, 0.1, -1), None),  # Estimate: nearly level front.
    "rubicon_front_blueprint.png": View((0, 0, -1), None),  # Estimate: straight front axis.
    "rubicon_front_tia.png": View((-1, 0.15, -0.5), None),  # Estimate: close-up of the front-left wheel and fender; the full model is shown for context.
    "rubicon_front_top.png": View((0.2, 0.4, -1), None),  # Estimate: raised front view slightly from the right.
    "rubicon_left_back_blueprint.pnt.png": View((-1, 0.35, 1), None),  # Estimate: wireframe rear-left three-quarter.
    "rubicon_left_back_top.png": View((-1, 1.0, 1), None),  # Estimate: high rear-left three-quarter.
    "rubicon_left_front.png": View((-1, 0.35, -1), None),  # Estimate: front-left three-quarter.
    "rubicon_left_front_blueprint.png": View((-1, 0.3, -1), None),  # Estimate: wireframe front-left three-quarter.
    "rubicon_left_front_top.png": View((-1, 0.9, -1), None),  # Estimate: elevated front-left.
    "rubicon_left_front_top2.png": View((-1, 0.9, -1), None),  # Estimate: second elevated front-left.
    "rubicon_left_side.png": View((-1, 0.05, 0), None),  # Estimate: nearly level left side.
    "rubicon_left_side2.png": View((-1, 0.05, 0), None),  # Estimate: second nearly level left side.
    "rubicon_left_side_top_blueprint.png": View((-1, 1.4, 0), None),  # Estimate: wireframe left side seen from about 55 degrees above.
    "rubicon_right_back.png": View((1, 0.35, 1), None),  # Estimate: rear-right three-quarter.
    "rubicon_right_back_side.png": View((1, 0.3, 1.2), None),  # Estimate: rear-right three-quarter, more side than rear.
    "rubicon_right_back_tia.png": View((1, 0.35, 1), None),  # Estimate: rear-right three-quarter.
    "rubicon_right_front.png": View((1, 0.35, -1), None),  # Estimate: front-right three-quarter.
    "rubicon_right_front_top.png": View((1, 0.9, -1), None),  # Estimate: elevated front-right.
    "rubicon_right_side_blueprint.png": View((1, 0, 0), None),  # Estimate: straight right axis.
}

RENDER_HEIGHT = 600
BACKGROUND = (235, 235, 235)
# ADR 0170 measured outer tire edges at x=111 and 737 in an 820 px reference.
# Reusing that fraction for other crops is approximate; silhouette includes bumpers.
SIDE_WHEEL_SPAN_FRACTION = (737 - 111) / 820


def photo_image(path: Path) -> renderer.Image:
    rows = renderer.read_png(path)
    return renderer.Image(len(rows[0]), len(rows), bytearray(c for row in rows for pixel in row for c in pixel))


def resize(image: renderer.Image, width: int, height: int) -> renderer.Image:
    """Average integer source boxes when shrinking; use nearest pixels when enlarging."""
    pixels = bytearray(width * height * 4)
    for y in range(height):
        y0 = y * image.height // height
        y1 = max(y0 + 1, (y + 1) * image.height // height)
        for x in range(width):
            x0 = x * image.width // width
            x1 = max(x0 + 1, (x + 1) * image.width // width)
            total = [0, 0, 0]
            count = (y1 - y0) * (x1 - x0)
            for sy in range(y0, y1):
                for sx in range(x0, x1):
                    i = (sy * image.width + sx) * 4
                    alpha = image.pixels[i + 3]
                    for c in range(3):
                        total[c] += image.pixels[i + c] * alpha + BACKGROUND[c] * (255 - alpha)
            i = (y * width + x) * 4
            pixels[i:i + 4] = bytes([round(v / (count * 255)) for v in total] + [255])
    return renderer.Image(width, height, pixels)


def comparison(photo: renderer.Image, render: renderer.Image, view: View) -> renderer.Image:
    width = max(1, round(photo.width * RENDER_HEIGHT / photo.height))
    left = resize(photo, width, RENDER_HEIGHT)
    scale = 1.0
    if abs(view.view[0]) > abs(view.view[1]) and abs(view.view[2]) <= 0.25 * abs(view.view[0]):
        xs = [i // 4 % render.width for i in range(0, len(render.pixels), 4) if render.pixels[i + 3] == 255]
        if xs:
            scale = width * SIDE_WHEEL_SPAN_FRACTION / (max(xs) - min(xs) + 1)
    right = resize(render, max(1, round(render.width * scale)), max(1, round(render.height * scale)))
    panel_width = max(width, right.width)
    output_width = width + panel_width
    pixels = bytearray((*BACKGROUND, 255)) * (output_width * RENDER_HEIGHT)
    for y in range(RENDER_HEIGHT):
        dest = y * output_width * 4
        pixels[dest:dest + width * 4] = left.pixels[y * width * 4:(y + 1) * width * 4]
        sy = y - (RENDER_HEIGHT - right.height) // 2
        if 0 <= sy < right.height:
            row = right.pixels[sy * right.width * 4:(sy + 1) * right.width * 4]
            if view.flip:
                row = bytearray(c for x in range(right.width - 1, -1, -1) for c in row[x * 4:x * 4 + 4])
            start = dest + (width + (panel_width - right.width) // 2) * 4
            pixels[start:start + len(row)] = row
    return renderer.Image(output_width, RENDER_HEIGHT, pixels)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("photos_dir", type=Path)
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args()
    for name, view in REFERENCE_VIEWS.items():
        path = args.photos_dir / name
        if not path.is_file():
            print(f"Warning: missing photo: {path}", file=sys.stderr)
            continue
        photo = photo_image(path)
        width = max(1, round(photo.width * RENDER_HEIGHT / photo.height))
        render = renderer.render_suv_view(args.resource_pack, view.view, view.screen_up, (width, RENDER_HEIGHT))
        result = comparison(photo, render, view)
        renderer.write_png(args.out_dir / f"{path.stem}.compare.png", *result)


if __name__ == "__main__":
    main()
