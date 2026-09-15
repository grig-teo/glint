#!/usr/bin/env python3
"""Generate Glint's PNG icons.

Run from the repository root:

    python3 tools/make_icons.py            # compliant set (128px store icon padded)
    python3 tools/make_icons.py --full-bleed  # square tiles everywhere

Writes icons/icon{16,32,48,128}.png. Rendering happens at 8x and is downsampled
with LANCZOS so the 16px icon stays crisp. Requires Pillow.

Why the store icon is different: the Chrome Web Store asks for a 128x128 PNG
whose *artwork* is 96x96 with 16 pixels of transparent padding on each side, so
it carries the same visual weight as neighbouring icons. Toolbar icons are the
opposite - they are drawn full bleed so they stay legible at 16px.
See https://developer.chrome.com/docs/webstore/images
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZES = (16, 32, 48, 128)
STORE_SIZE = 128
# 96 / 128: the artwork-to-canvas ratio the Web Store recommends.
STORE_ARTWORK_RATIO = 0.75
SUPERSAMPLE = 8
OUT_DIR = Path(__file__).resolve().parent.parent / "icons"

# Indigo -> violet, matching the popup's accent colour.
TOP = (109, 93, 246)
BOTTOM = (79, 70, 229)
SPARKLE = (255, 255, 255)


def vertical_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    gradient = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        gradient.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return gradient.resize((size, size), Image.Resampling.NEAREST)


def astroid(cx: float, cy: float, radius: float, steps: int = 240) -> list[tuple[float, float]]:
    """A four-pointed sparkle: x = a·cos³t, y = a·sin³t."""
    points = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        points.append(
            (
                cx + radius * math.cos(t) ** 3,
                cy + radius * math.sin(t) ** 3,
            )
        )
    return points


def artwork(size: int) -> Image.Image:
    """The tile itself: gradient rounded square plus the sparkle."""
    canvas = vertical_gradient(size, TOP, BOTTOM).convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * 0.235), fill=255
    )
    canvas.putalpha(mask)

    draw = ImageDraw.Draw(canvas)

    # Main sparkle, optically centred (slightly above centre reads better).
    draw.polygon(astroid(size * 0.50, size * 0.485, size * 0.335), fill=SPARKLE)

    # Small companion sparkle, top-right, for the "✨" feel at larger sizes.
    if size >= 32:
        draw.polygon(astroid(size * 0.755, size * 0.245, size * 0.115), fill=SPARKLE)

    return canvas


def render(size: int, artwork_ratio: float = 1.0) -> Image.Image:
    work = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (work, work), (0, 0, 0, 0))

    art = max(1, round(work * artwork_ratio))
    piece = artwork(art)
    offset = (work - art) // 2
    canvas.paste(piece, (offset, offset), piece)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--full-bleed",
        action="store_true",
        help="render every size full bleed, including the 128px store icon",
    )
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        # The store icon is padded by default, because that is the size the
        # Chrome Web Store picks out of the package.
        ratio = 1.0 if (args.full_bleed or size != STORE_SIZE) else STORE_ARTWORK_RATIO
        path = OUT_DIR / f"icon{size}.png"
        render(size, ratio).save(path, "PNG", optimize=True)
        note = " (store: 96x96 artwork, transparent padding)" if ratio != 1.0 else ""
        print(f"wrote {path.relative_to(OUT_DIR.parent)} ({size}x{size}){note}")


if __name__ == "__main__":
    main()
