#!/usr/bin/env python3
"""Generate Glint's PNG icons.

Run from the repository root:

    python3 tools/make_icons.py

Writes icons/icon{16,32,48,128}.png. Rendering happens at 8x and is downsampled
with LANCZOS so the 16px icon stays crisp. Requires Pillow.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZES = (16, 32, 48, 128)
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


def render(size: int) -> Image.Image:
    work = size * SUPERSAMPLE
    canvas = vertical_gradient(work, TOP, BOTTOM).convert("RGBA")

    # Rounded-square mask (squircle-ish radius).
    mask = Image.new("L", (work, work), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, work - 1, work - 1), radius=int(work * 0.235), fill=255
    )
    canvas.putalpha(mask)

    draw = ImageDraw.Draw(canvas)

    # Main sparkle, optically centred (slightly above centre reads better).
    draw.polygon(astroid(work * 0.50, work * 0.485, work * 0.335), fill=SPARKLE)

    # Small companion sparkle, top-right, for the "✨" feel at larger sizes.
    if size >= 32:
        draw.polygon(astroid(work * 0.755, work * 0.245, work * 0.115), fill=SPARKLE)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        render(size).save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(OUT_DIR.parent)} ({size}x{size})")


if __name__ == "__main__":
    main()
