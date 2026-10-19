"""Build the existing app logo for Windows packaging.

Development-only dependency: Pillow. The desktop program does not use Python.
The SVG uses only rectangles, so rasterization is deterministic and needs no
browser, external renderer, font download, or network connection.

Usage from the project directory:
    python desktop/assets/generate-icon.py
"""

from __future__ import annotations

import argparse
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageColor, ImageDraw


ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)
PNG_SIZE = 1024
SUPERSAMPLING = 4


def rasterize_rect_svg(path: Path, output_size: int) -> Image.Image:
    """Render this small, font-free SVG subset while retaining corner alpha."""
    root = ET.parse(path).getroot()
    view_box = tuple(float(value) for value in root.attrib["viewBox"].split())
    if view_box[:2] != (0, 0) or view_box[2] != view_box[3]:
        raise ValueError("Expected a square SVG viewBox starting at 0, 0.")

    render_size = output_size * SUPERSAMPLING
    scale = render_size / view_box[2]
    canvas = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def render(node: ET.Element, inherited_fill: str = "#000000") -> None:
        tag = node.tag.rsplit("}", 1)[-1]
        fill = node.attrib.get("fill", inherited_fill)
        if tag in {"title", "desc"}:
            return
        if tag in {"svg", "g"}:
            for child in node:
                render(child, fill)
            return
        if tag != "rect":
            raise ValueError(f"Unsupported SVG element: {tag}")
        x = float(node.attrib.get("x", "0")) * scale
        y = float(node.attrib.get("y", "0")) * scale
        width = float(node.attrib["width"]) * scale
        height = float(node.attrib["height"]) * scale
        radius = float(node.attrib.get("rx", "0")) * scale
        color = ImageColor.getcolor(fill, "RGBA")
        bounds = (x, y, x + width, y + height)
        if radius:
            draw.rounded_rectangle(bounds, radius=radius, fill=color)
        else:
            draw.rectangle(bounds, fill=color)

    render(root)
    return canvas.resize((output_size, output_size), Image.Resampling.LANCZOS)


def build_assets(asset_directory: Path) -> None:
    svg_path = asset_directory / "icon.svg"
    master = rasterize_rect_svg(svg_path, PNG_SIZE)
    master.save(asset_directory / "icon.png", format="PNG", optimize=True)
    master.save(
        asset_directory / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in ICON_SIZES],
    )
    print(f"Built {PNG_SIZE} x {PNG_SIZE} RGBA PNG and ICO sizes {ICON_SIZES}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--assets",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Directory containing icon.svg; PNG and ICO are written beside it.",
    )
    arguments = parser.parse_args()
    build_assets(arguments.assets.resolve())
