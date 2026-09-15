#!/usr/bin/env python3
"""Composite a Glint popup screenshot into a Chrome Web Store screenshot.

The store accepts screenshots of 1280x800 or 640x400, as JPEG or as 24-bit PNG
with **no alpha channel**. A raw screen capture is portrait and usually RGBA, so
it cannot be uploaded as-is: this builds a compliant landscape panel with the
capture on the left and a short caption on the right.

Example:

    python3 tools/make-store-panel.py \
        --input ~/Desktop/popup.png \
        --output docs/screenshots/05-providers.png \
        --title "Any provider, your key" \
        --lead "Presets fill in the endpoint and model for you." \
        --accent "OpenAI · DeepSeek · Groq · OpenRouter" \
        --accent "Anthropic · Ollama on your own machine" \
        --body "Test the connection in one click" \
        --body "Nothing is sent until you click the button" \
        --body "No account, no telemetry, no middleman"

Requires Pillow. Run from the repository root.
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

THEMES = {
    "dark": {
        "gradient": ((26, 27, 46), (9, 10, 14)),
        "ink": (242, 244, 248),
        "muted": (154, 161, 173),
        "accent": (140, 140, 255),
        "hairline": (255, 255, 255, 26),
        "shadow": (0, 0, 0, 150),
        "panel_scale": 0.5,  # captures are usually 2x
    },
    "light": {
        "gradient": ((255, 255, 255), (231, 234, 240)),
        "ink": (20, 22, 26),
        "muted": (107, 114, 128),
        "accent": (79, 70, 229),
        "hairline": (16, 18, 22, 24),
        "shadow": (16, 18, 22, 90),
        "panel_scale": 0.5,
    },
}


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    strip = Image.new("RGB", (1, height))
    for y in range(height):
        t = y / max(1, height - 1)
        strip.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return strip.resize(size, Image.Resampling.NEAREST)


def rounded_panel(image: Image.Image, radius: int) -> Image.Image:
    """Give the capture rounded corners so it reads as a floating window."""
    scale = 4
    mask = Image.new("L", (image.width * scale, image.height * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, image.width * scale - 1, image.height * scale - 1), radius=radius * scale, fill=255
    )
    out = image.copy()
    out.putalpha(mask.resize(image.size, Image.Resampling.LANCZOS))
    return out


def build(args: argparse.Namespace) -> Image.Image:
    target_w, target_h = (int(v) for v in args.size.lower().split("x"))
    theme = THEMES[args.theme]
    # Compose at the store's preferred 1280x800, then scale if a smaller size
    # was asked for, so the layout maths is always in one coordinate space.
    W, H = 1280, 800

    canvas = gradient((W, H), *theme["gradient"]).convert("RGBA")

    source = Image.open(args.input).convert("RGBA")
    panel = source.resize(
        (round(source.width * theme["panel_scale"]), round(source.height * theme["panel_scale"])),
        Image.LANCZOS,
    )
    radius = 16
    panel = rounded_panel(panel, radius)

    px = 148
    py = (H - panel.height) // 2

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (px + 6, py + 18, px + panel.width + 6, py + panel.height + 18),
        radius=radius,
        fill=theme["shadow"],
    )
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(24)))
    canvas.paste(panel, (px, py), panel)
    ImageDraw.Draw(canvas).rounded_rectangle(
        (px, py, px + panel.width - 1, py + panel.height - 1),
        radius=radius,
        outline=theme["hairline"],
        width=1,
    )

    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(FONT_BOLD, 40)
    lead_font = ImageFont.truetype(FONT_REGULAR, 20)
    accent_font = ImageFont.truetype(FONT_REGULAR, 19)
    body_font = ImageFont.truetype(FONT_REGULAR, 19)

    tx = px + panel.width + 84
    draw.text((tx, 236), args.title, font=title_font, fill=theme["ink"])
    if args.lead:
        draw.text((tx, 292), args.lead, font=lead_font, fill=theme["muted"])

    y = 372
    for line in args.accent:
        draw.text((tx, y), line, font=accent_font, fill=theme["accent"])
        y += 30
    if args.accent:
        y += 22
    for line in args.body:
        draw.text((tx, y), line, font=body_font, fill=theme["ink"])
        y += 36

    if (target_w, target_h) != (W, H):
        canvas = canvas.resize((target_w, target_h), Image.LANCZOS)
    return canvas.convert("RGB")


def report(path: Path) -> None:
    """Verify the store's format rules on the file we just wrote."""
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
        (f"size {width}x{height}", (width, height) in ((1280, 800), (640, 400))),
        (f"colour type {colour_type} (2 = 24-bit RGB)", colour_type == 2),
        (f"bit depth {depth}", depth == 8),
        ("no tRNS chunk", not has_trns),
    ]
    print(f"\n{path}")
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    if not all(ok for _, ok in checks):
        sys.exit("screenshot does not meet the Chrome Web Store format rules")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, help="capture to composite (usually a 2x screenshot)")
    parser.add_argument("--output", required=True, help="PNG to write")
    parser.add_argument("--size", default="1280x800", help="1280x800 (preferred) or 640x400")
    parser.add_argument("--theme", choices=sorted(THEMES), default="dark")
    parser.add_argument("--title", required=True)
    parser.add_argument("--lead", default="")
    parser.add_argument("--accent", action="append", default=[], help="repeatable")
    parser.add_argument("--body", action="append", default=[], help="repeatable")
    args = parser.parse_args()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    build(args).save(out, "PNG", optimize=True)
    report(out)


if __name__ == "__main__":
    main()
