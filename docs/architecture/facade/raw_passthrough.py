#!/usr/bin/env python3
"""Generate the facade raw-passthrough diagram.

Run from the repository root:

  python3 docs/architecture/facade/raw_passthrough.py \
    --output docs/architecture/facade/raw-passthrough.svg

The SVG is self-contained and includes accessible title and description
elements. Render it at 2× to produce the companion 2400 × 1800 PNG.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from html import escape
from pathlib import Path


WIDTH = 1200
HEIGHT = 900

WHITE = "#FFFFFF"
INK = "#444441"
MUTED = "#5F5E5A"
HAIR = "#E3E1D9"
GRAY = "#888780"
NEUTRAL_FILL = "#F1EFE8"
BAND_FILL = "#FAF9F5"

PURPLE = "#7F77DD"
PURPLE_DARK = "#3C3489"
PURPLE_FILL = "#EEEDFE"

CORAL = "#D85A30"
CORAL_TEXT = "#993C1D"
CORAL_DARK = "#712B13"
CORAL_FILL = "#FAECE7"

BLUE = "#378ADD"
BLUE_TEXT = "#185FA5"
BLUE_FILL = "#E6F1FB"

TEAL = "#1D9E75"
TEAL_TEXT = "#0F6E56"
TEAL_DARK = "#085041"
TEAL_FILL = "#E1F5EE"

AMBER = "#C47A1A"
AMBER_TEXT = "#854F0B"
AMBER_FILL = "#FAEEDA"


@dataclass(frozen=True)
class Box:
    """Node geometry used for border-to-border connectors."""

    x: float
    y: float
    width: float
    height: float

    @property
    def left(self) -> float:
        return self.x

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    def port(self, side: str) -> tuple[float, float]:
        if side == "left":
            return (self.left, self.center_y)
        if side == "right":
            return (self.right, self.center_y)
        raise ValueError(f"unknown horizontal box side: {side}")


def marker(marker_id: str, color: str) -> str:
    """Create an open-chevron flow marker."""

    return f'''<marker id="{marker_id}" viewBox="0 0 10 10" refX="8" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="{color}" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
    </marker>'''


def label(
    x: float,
    y: float,
    value: str,
    *,
    size: float,
    color: str,
    weight: int = 400,
    anchor: str = "middle",
) -> str:
    """Create one escaped SVG text label."""

    return (
        f'<text x="{x:g}" y="{y:g}" text-anchor="{anchor}" '
        f'font-size="{size:g}" font-weight="{weight}" fill="{color}">'
        f"{escape(value)}</text>"
    )


def route(
    points: list[tuple[float, float]],
    color: str,
    marker_id: str,
    *,
    dashed: bool = False,
) -> str:
    """Create an orthogonal connector between explicit node ports."""

    if len(points) < 2:
        raise ValueError("a route requires at least two points")

    for start, end in zip(points, points[1:]):
        if start[0] != end[0] and start[1] != end[1]:
            raise ValueError(f"route segment is not orthogonal: {start} → {end}")

    commands = [f"M{points[0][0]:g} {points[0][1]:g}"]
    commands.extend(f"L{x:g} {y:g}" for x, y in points[1:])
    dash = ' stroke-dasharray="5 4"' if dashed else ""

    return (
        f'<path d="{" ".join(commands)}" fill="none" stroke="{color}" '
        'stroke-width="1.5" stroke-linecap="round" '
        f'stroke-linejoin="round"{dash} marker-end="url(#{marker_id})"/>'
    )


def band(
    y: float,
    height: float,
    title: str,
    subtitle: str,
    direction: str,
) -> str:
    """Create one comparison phase band and direction pill."""

    return "\n  ".join(
        [
            (
                f'<rect x="68" y="{y:g}" width="1064" height="{height:g}" '
                f'rx="10" fill="{BAND_FILL}" stroke="{HAIR}" stroke-width="1"/>'
            ),
            label(
                86,
                y + 25,
                title,
                size=11,
                color=INK,
                weight=600,
                anchor="start",
            ),
            label(
                86,
                y + 43,
                subtitle,
                size=9.8,
                color=MUTED,
                anchor="start",
            ),
            (
                f'<rect x="946" y="{y + 12:g}" width="158" height="28" '
                f'rx="14" fill="{NEUTRAL_FILL}" stroke="{GRAY}" '
                'stroke-width="1" stroke-dasharray="4 3"/>'
            ),
            label(
                1025,
                y + 30,
                direction,
                size=9.2,
                color=MUTED,
                weight=500,
            ),
        ]
    )


def card(
    box: Box,
    title: str,
    details: tuple[str, ...],
    *,
    fill: str,
    stroke: str,
    title_color: str,
    detail_color: str,
    dashed: bool = False,
) -> str:
    """Create one node card with one or two detail lines."""

    dash = ' stroke-dasharray="5 4"' if dashed else ""
    title_offset = 29 if len(details) == 1 else 27
    detail_offset = 51 if len(details) == 1 else 49
    parts = [
        (
            f'<rect x="{box.x:g}" y="{box.y:g}" width="{box.width:g}" '
            f'height="{box.height:g}" rx="8" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="1"{dash}/>'
        ),
        label(
            box.x + box.width / 2,
            box.y + title_offset,
            title,
            size=12.5,
            color=title_color,
            weight=500,
        ),
    ]

    for index, detail in enumerate(details):
        parts.append(
            label(
                box.x + box.width / 2,
                box.y + detail_offset + index * 13,
                detail,
                size=9.2,
                color=detail_color,
            )
        )

    return "\n  ".join(parts)


def conclusion(y: float, text: str, *, fill: str, stroke: str, color: str) -> str:
    """Create the conclusion bar for one response alternative."""

    return "\n  ".join(
        [
            (
                f'<rect x="220" y="{y:g}" width="760" height="44" rx="8" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="1"/>'
            ),
            label(600, y + 27, text, size=10.2, color=color, weight=500),
        ]
    )


def footer_pill(x: float, text: str) -> str:
    """Create a compact final invariant pill."""

    return "\n  ".join(
        [
            (
                f'<rect x="{x:g}" y="850" width="300" height="28" rx="14" '
                f'fill="{NEUTRAL_FILL}" stroke="{GRAY}" stroke-width="1" '
                'stroke-dasharray="4 3"/>'
            ),
            label(x + 150, 868, text, size=9.2, color=MUTED, weight=500),
        ]
    )


def render() -> str:
    """Compose the complete comparison diagram."""

    parts: list[str] = []
    parts.append(
        label(
            600,
            34,
            "Benchmark asset facade · compressed response flow",
            size=19,
            color=INK,
            weight=500,
        )
    )
    parts.append(
        label(
            600,
            58,
            "the request topology stays the same · only the server-side return path changes",
            size=11.5,
            color=MUTED,
        )
    )

    parts.append(
        band(
            82,
            210,
            "1 · COMMON REQUEST PATH",
            "the iframe initiates a normal asset request · the website creates one sequential upstream request",
            "REQUEST →",
        )
    )
    request_boxes = [
        Box(100, 164, 250, 72),
        Box(475, 164, 250, 72),
        Box(850, 164, 250, 72),
    ]
    request_cards = [
        (
            "browser · hidden iframe",
            ("GET /zones/<target>/_next/…",),
        ),
        (
            "website zone route",
            ("first segment === '_next' · select target",),
        ),
        (
            "target Next.js app",
            ("GET /_next/static/…",),
        ),
    ]
    for box, (title, details) in zip(request_boxes, request_cards):
        parts.append(
            card(
                box,
                title,
                details,
                fill=PURPLE_FILL,
                stroke=PURPLE,
                title_color=PURPLE_DARK,
                detail_color=PURPLE_DARK,
            )
        )
    parts.append(
        route(
            [request_boxes[0].port("right"), request_boxes[1].port("left")],
            PURPLE,
            "arrow-purple",
        )
    )
    parts.append(
        route(
            [request_boxes[1].port("right"), request_boxes[2].port("left")],
            PURPLE,
            "arrow-purple",
        )
    )
    parts.append(label(412.5, 190, "client request", size=9.2, color=PURPLE_DARK))
    parts.append(label(787.5, 190, "server request", size=9.2, color=PURPLE_DARK))
    parts.append(
        label(
            600,
            269,
            "one browser request · one server-to-target request",
            size=10.2,
            color=MUTED,
        )
    )

    parts.append(
        band(
            312,
            250,
            "2 · PREVIOUS · TRANSFORMING RETURN PATH",
            "historical comparison only · this response is not used by the current benchmark",
            "← NOT MEASURED",
        )
    )
    old_boxes = [
        Box(88, 398, 220, 78),
        Box(340, 398, 220, 78),
        Box(592, 398, 220, 78),
        Box(844, 398, 244, 78),
    ]
    parts.append(
        card(
            old_boxes[0],
            "browser",
            ("receives one response", "outer representation"),
            fill=NEUTRAL_FILL,
            stroke=GRAY,
            title_color=INK,
            detail_color=MUTED,
        )
    )
    parts.append(
        card(
            old_boxes[1],
            "facade + platform",
            ("encoding metadata removed", "may recompress"),
            fill=AMBER_FILL,
            stroke=AMBER,
            title_color=AMBER_TEXT,
            detail_color=AMBER_TEXT,
            dashed=True,
        )
    )
    parts.append(
        card(
            old_boxes[2],
            "server-side fetch()",
            ("automatically decodes", "the JavaScript response"),
            fill=CORAL_FILL,
            stroke=CORAL,
            title_color=CORAL_DARK,
            detail_color=CORAL_TEXT,
        )
    )
    parts.append(
        card(
            old_boxes[3],
            "target Next.js app",
            ("Content-Encoding: br / gzip", "encoded JavaScript response"),
            fill=PURPLE_FILL,
            stroke=PURPLE,
            title_color=PURPLE_DARK,
            detail_color=PURPLE_DARK,
        )
    )
    parts.append(
        route(
            [old_boxes[3].port("left"), old_boxes[2].port("right")],
            CORAL,
            "arrow-coral",
        )
    )
    parts.append(
        route(
            [old_boxes[2].port("left"), old_boxes[1].port("right")],
            CORAL,
            "arrow-coral",
        )
    )
    parts.append(
        route(
            [old_boxes[1].port("left"), old_boxes[0].port("right")],
            AMBER,
            "arrow-amber",
            dashed=True,
        )
    )
    parts.append(
        conclusion(
            496,
            "transferred JS size describes the website response · target encoding is not guaranteed",
            fill=CORAL_FILL,
            stroke=CORAL,
            color=CORAL_DARK,
        )
    )

    parts.append(
        band(
            580,
            250,
            "3 · CURRENT · RAW PASSTHROUGH RETURN PATH",
            "the website transports the client chunk without decoding or executing it",
            "← MEASURED RESPONSE",
        )
    )
    raw_boxes = [
        Box(88, 666, 220, 78),
        Box(340, 666, 220, 78),
        Box(592, 666, 220, 78),
        Box(844, 666, 244, 78),
    ]
    parts.append(
        card(
            raw_boxes[0],
            "browser",
            ("receives once · measures", "decodes · executes JS"),
            fill=BLUE_FILL,
            stroke=BLUE,
            title_color=BLUE_TEXT,
            detail_color=BLUE_TEXT,
        )
    )
    parts.append(
        card(
            raw_boxes[1],
            "raw facade response",
            ("encoding + length preserved", "same JavaScript byte stream"),
            fill=TEAL_FILL,
            stroke=TEAL,
            title_color=TEAL_DARK,
            detail_color=TEAL_TEXT,
        )
    )
    parts.append(
        card(
            raw_boxes[2],
            "node:http stream",
            ("raw IncomingMessage", "no automatic decoding"),
            fill=TEAL_FILL,
            stroke=TEAL,
            title_color=TEAL_DARK,
            detail_color=TEAL_TEXT,
        )
    )
    parts.append(
        card(
            raw_boxes[3],
            "target Next.js app",
            ("Content-Encoding: br / gzip", "encoded JavaScript response"),
            fill=PURPLE_FILL,
            stroke=PURPLE,
            title_color=PURPLE_DARK,
            detail_color=PURPLE_DARK,
        )
    )
    for source, target in zip(reversed(raw_boxes[1:]), reversed(raw_boxes[:-1])):
        parts.append(
            route(
                [source.port("left"), target.port("right")],
                TEAL,
                "arrow-teal",
            )
        )
    parts.append(
        conclusion(
            764,
            "BENCHMARK USES THIS RESPONSE · encoded JS bytes · decoded JS bytes",
            fill=TEAL_FILL,
            stroke=TEAL,
            color=TEAL_DARK,
        )
    )
    parts.append(footer_pill(244, "ONE CLIENT REQUEST · ONE RESPONSE"))
    parts.append(footer_pill(656, "ONLY THE BROWSER EXECUTES THE CHUNK"))

    definitions = "\n    ".join(
        [
            marker("arrow-purple", PURPLE),
            marker("arrow-coral", CORAL),
            marker("arrow-amber", AMBER),
            marker("arrow-teal", TEAL),
        ]
    )
    description = (
        "The browser makes one request to the benchmark website, which makes "
        "one upstream request to the target Next.js application. The former "
        "fetch facade automatically decodes the compressed JavaScript response "
        "and may create a new encoded representation. Raw passthrough retains "
        "the target bytes and compression metadata so the browser measures the "
        "target encoded JavaScript size before decoding and executing it. The "
        "former fetch path is shown only for comparison; the benchmark measures "
        "the browser-visible response from the raw-passthrough path."
    )
    svg_content = "\n  ".join(parts)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}"
  viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
  font-family="system-ui, -apple-system, sans-serif" shape-rendering="geometricPrecision">
  <title>Benchmark asset facade compressed response flow</title>
  <desc>{escape(description)}</desc>
  <defs>
    {definitions}
  </defs>
  <rect width="{WIDTH}" height="{HEIGHT}" rx="8" fill="{WHITE}"/>
  {svg_content}
</svg>'''


def main() -> None:
    """Write the SVG to stdout or an explicit output path."""

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the generated SVG to this path instead of stdout.",
    )
    args = parser.parse_args()
    svg = render()

    if args.output is None:
        print(svg)
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(f"{svg}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
