#!/usr/bin/env python3
"""Generate the Chrome Web Store promotional tile.

    python3 tools/make-promo.py                        # 440x280, required tile
    python3 tools/make-promo.py --size 1400x560        # marquee, for featuring

Writes a 24-bit PNG with no alpha channel, which is what the store requires.

Design follows Google's guidance for promotional images
(https://developer.chrome.com/docs/webstore/images):

  * saturated colours, because it is displayed on a light grey background
  * fills the entire region, edges well defined
  * no explanatory text - only the wordmark, so nothing turns to mush when the
    store shrinks it to half size
  * the sparkle and wordmark both stay recognisable at 220x140

Requires Pillow. Run from the repository root.
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_icons import BOTTOM, TOP, astroid  # noqa: E402  (brand colours, sparkle shape)

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
OUT_DEFAULT = "docs/promo/promo-440x280.png"

# Canvas width : height, used to scale the layout for either store size.
LAYOUT = {
    (440, 280): dict(radius=62, font=64, gap=26, margin=34),
    (1400, 560): dict(radius=124, font=128, gap=52, margin=68),
}


def diagonal_gradient(size: tuple[int, int]) -> Image.Image:
    """Saturated brand gradient across the whole tile, lighter top-left."""
    width, height = size
    canvas = Image.new("RGB", size)
    pixels = canvas.load()
    span = width + height
    for y in range(height):
        for x in range(0, width, 4):  # fill 4px at a time, then smooth below
            t = (x + y) / span
            colour = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
            for dx in range(4):
                if x + dx < width:
                    pixels[x + dx, y] = colour
    return canvas.filter(ImageFilter.GaussianBlur(2))


def glow(size: tuple[int, int], centre: tuple[int, int], radius: int) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(
        (centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius),
        fill=(255, 255, 255, 46),
    )
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))


def build(width: int, height: int) -> Image.Image:
    cfg = LAYOUT.get((width, height)) or LAYOUT[(440, 280)]
    scale = width / 440
    radius, gap, margin = cfg["radius"], cfg["gap"], cfg["margin"]

    canvas = diagonal_gradient((width, height)).convert("RGBA")

    font = ImageFont.truetype(FONT_BOLD, cfg["font"])
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    text_w = probe.textlength("Glint", font=font)
    text_h = cfg["font"]

    # Centre the sparkle + wordmark lockup horizontally.
    lockup = radius * 2 + gap + text_w
    left = max(margin, (width - lockup) / 2)
    sparkle_cx = left + radius
    sparkle_cy = height / 2

    canvas = Image.alpha_composite(
        canvas, glow((width, height), (sparkle_cx, sparkle_cy), radius * 1.9)
    )
    draw = ImageDraw.Draw(canvas)
    draw.polygon(astroid(sparkle_cx, sparkle_cy, radius), fill=(255, 255, 255))

    draw.text(
        (left + radius * 2 + gap, sparkle_cy),
        "Glint",
        font=font,
        fill=(255, 255, 255),
        anchor="lm",
    )

    # A small companion sparkle keeps the mark from looking like a plain star.
    if width >= 440:
        draw.polygon(
            astroid(sparkle_cx + radius * 0.72, sparkle_cy - radius * 0.74, radius * 0.24),
            fill=(255, 255, 255),
        )

    return canvas.convert("RGB")


def report(path: Path, expected: tuple[int, int]) -> None:
    data = path.read_bytes()
    width, height, depth, colour_type = struct.unpack(">IIBB", data[16:26])
    off, has_trns = 8, False
    while off < len(data):
        length, name = struct.unpack(">I4s", data[off : off + 8])
        if name == b"tRNS":
            has_trns = True
        off += 12 + length
        if name == b"IEND":
            break

    checks = [
        (f"size {width}x{height}", (width, height) == expected),
        (f"colour type {colour_type} (2 = 24-bit RGB)", colour_type == 2),
        (f"bit depth {depth}", depth == 8),
        ("no tRNS chunk", not has_trns),
    ]
    print(f"\n{path}")
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    if not all(ok for _, ok in checks):
        sys.exit("promotional image does not meet the Chrome Web Store format rules")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--size", default="440x280", help="440x280 (required) or 1400x560 (marquee)")
    parser.add_argument("--output", default="", help=f"default: {OUT_DEFAULT}")
    args = parser.parse_args()

    width, height = (int(v) for v in args.size.lower().split("x"))
    if (width, height) not in LAYOUT:
        parser.error(f"unsupported size {args.size}; expected 440x280 or 1400x560")

    out = Path(args.output or f"docs/promo/promo-{width}x{height}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    build(width, height).save(out, "PNG", optimize=True)
    report(out, (width, height))


if __name__ == "__main__":
    main()
