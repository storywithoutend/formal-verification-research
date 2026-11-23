#!/usr/bin/env python3
"""Turn a TLC DOT dump of Model.tla into a readable Graphviz file.

TLC's -dump dot labels include the entire state record, which makes a
15-state graph tens of thousands of pixels tall. This keeps phase,
lifecycle, and a few interface fields, plus the action names on edges.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path


def unquote(label: str) -> str:
    return label.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")


def field(raw: str, pat: str, default: str = "?") -> str:
    match = re.search(pat, raw)
    return match.group(1) if match else default


def short_set(value: str) -> str:
    if value in ("{}", "?"):
        return "none"
    return (
        value.replace('"root.eth"', "root")
        .replace('"child.root.eth"', "child")
        .replace(" ", "")
    )


def parse_dot(text: str):
    nodes = {}
    edges = []
    for line in text.splitlines():
        match = re.match(r'(-?\d+)\s+->\s+(-?\d+)\s+\[label="([^"]+)"', line)
        if match:
            edges.append((match.group(1), match.group(2), match.group(3)))
            continue
        match = re.match(r'(-?\d+)\s+\[label="(.*)"(?:,style = filled)?\]', line)
        if match:
            raw = unquote(match.group(2))
            nodes[match.group(1)] = {
                "phase": field(raw, r"phase \|-> (\d+)"),
                "lifecycle": field(raw, r'lifecycle \|-> "([^"]+)"'),
                "intents": field(raw, r"intents \|-> (\{[^}]*\})", "{}"),
                "unresolved": field(raw, r"unresolvedNames \|-> (\{[^}]*\})", "{}"),
                "prompting": field(raw, r"promptingTabs \|-> (\{[^}]*\})", "{}"),
                "claimed": field(raw, r"completionClaimed \|-> (TRUE|FALSE)", "FALSE"),
            }
    return nodes, edges


def compact_dot(nodes, edges, rankdir: str) -> str:
    lines = [
        "digraph MigrationCORE {",
        f"  rankdir={rankdir};",
        "  graph [fontname=Helvetica, fontsize=12, labelloc=t, labeljust=c,",
        '         label="ENS manager migration — CORE scenario (hardened)\\n'
        'TLC: 15 distinct states, depth 15, outdegree 1"];',
        '  node [shape=box, style="filled,rounded", fontname=Helvetica, fontsize=10,'
        ' color="#333333", margin="0.12,0.08"];',
        '  edge [fontname=Helvetica, fontsize=9, color="#3b6d9a", fontcolor="#1f3d5b"];',
    ]
    for nid, info in nodes.items():
        extras = []
        if info["prompting"] not in ("{}", "?"):
            extras.append("prompt " + short_set(info["prompting"]))
        if info["intents"] not in ("{}", "?"):
            extras.append("intent " + short_set(info["intents"]))
        if info["unresolved"] not in ("{}", "?"):
            extras.append("unresolved " + short_set(info["unresolved"]))
        if info["claimed"] == "TRUE":
            extras.append("claimed")
        label = f"phase {info['phase']}\\n{info['lifecycle']}"
        if extras:
            label += "\\n" + "\\n".join(extras)
        fill = "#f4f1ea"
        if info["lifecycle"] == "idle":
            fill = "#dce8d8"
        elif info["lifecycle"] == "blocked":
            fill = "#f3e0c8"
        elif info["lifecycle"] == "success":
            fill = "#d4e4f5"
        lines.append(f'  "{nid}" [label="{label}", fillcolor="{fill}"];')
    for src, dst, action in edges:
        attrs = f'label="{action}"'
        if src == dst:
            attrs += ", constraint=false"
        lines.append(f'  "{src}" -> "{dst}" [{attrs}];')
    lines.append("}")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dot")
    parser.add_argument("output_dot")
    parser.add_argument("--rankdir", choices=("LR", "TB"), default="LR")
    args = parser.parse_args()
    text = Path(args.input_dot).read_text()
    nodes, edges = parse_dot(text)
    if not nodes or not edges:
        raise SystemExit(f"no nodes/edges parsed from {args.input_dot}")
    Path(args.output_dot).write_text(compact_dot(nodes, edges, args.rankdir))
    print(f"wrote {args.output_dot} ({len(nodes)} nodes, {len(edges)} edges)")


if __name__ == "__main__":
    main()
