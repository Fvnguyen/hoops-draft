"""Weekly card-set refresh (season_2026_27 D8/D11). Run from the repo root as
`npm run refresh:season`, or from data/ as `python refresh_season.py`.

1. Freeze the shipping cards.json to frontend/src/data/cardsets/<version>.json and keep
   only the KEEP_FROZEN most recent frozen sets (FROZEN_CARD_SETS in engine/cardSets.ts
   is rewritten to match).
2. Bump CARD_SET_VERSION: <current season>.1 on a new season, else the next step.
3. Scrape every season (download_bref.js), rosters (fetch_bio.py), build game.db
   (fetch_players.py), headshots (download_images.py), cards (npm run build:cards) and the
   daily display stats (refresh_stats.js).
4. Print, and with --summary FILE also write, added/dropped players and rarity counts
   against the previous set (the weekly PR body).

--skip-scrape rebuilds from the snapshots already on disk (no network, no freeze, no
bump): two runs in a row must produce an identical cards.json.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter

DATA = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(DATA)
FRONTEND = os.path.join(ROOT, "frontend")
CARDS = os.path.join(FRONTEND, "src", "data", "cards.json")
CARDSETS = os.path.join(FRONTEND, "src", "data", "cardsets")
VERSION_TS = os.path.join(FRONTEND, "src", "engine", "cardSetVersion.ts")
CARDSETS_TS = os.path.join(FRONTEND, "src", "engine", "cardSets.ts")
KEEP_FROZEN = 4
VERSION_RE = re.compile(r"export const CARD_SET_VERSION = '([^']+)';")
IS_WIN = sys.platform == "win32"


def run(cmd, cwd):
    print(f"\n$ {' '.join(cmd)}  (in {os.path.relpath(cwd, ROOT) or '.'})", flush=True)
    subprocess.run(cmd, cwd=cwd, check=True, shell=IS_WIN)


def read_version():
    with open(VERSION_TS, encoding="utf-8") as f:
        return VERSION_RE.search(f.read()).group(1)


def next_version(old, season):
    prefix, _, step = old.rpartition(".")
    return f"{season}.{int(step) + 1}" if prefix == season else f"{season}.1"


def version_key(v):
    season, _, step = v.rpartition(".")
    return (season, int(step))


def freeze(old):
    os.makedirs(CARDSETS, exist_ok=True)
    shutil.copyfile(CARDS, os.path.join(CARDSETS, f"{old}.json"))
    kept = sorted((f[:-5] for f in os.listdir(CARDSETS) if f.endswith(".json")), key=version_key, reverse=True)
    for v in kept[KEEP_FROZEN:]:
        os.remove(os.path.join(CARDSETS, f"{v}.json"))
        print(f"Dropped frozen card set {v}")
    kept = kept[:KEEP_FROZEN]
    entries = "".join(f"  '{v}': () => import('@/data/cardsets/{v}.json'),\n" for v in kept)
    with open(CARDSETS_TS, encoding="utf-8") as f:
        src = f.read()
    src = re.sub(
        r"(// BEGIN FROZEN_CARD_SETS[^\n]*\n.*?= \{\n).*?(\};\n// END FROZEN_CARD_SETS)",
        lambda m: m.group(1) + entries + m.group(2), src, flags=re.S)
    with open(CARDSETS_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    print(f"Frozen card sets kept: {', '.join(kept)}")


def write_version(new):
    with open(VERSION_TS, encoding="utf-8") as f:
        src = f.read()
    with open(VERSION_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write(VERSION_RE.sub(f"export const CARD_SET_VERSION = '{new}';", src))


def summary(previous_path, version):
    with open(CARDS, encoding="utf-8") as f:
        new = json.load(f)
    old = []
    if previous_path and os.path.exists(previous_path):
        with open(previous_path, encoding="utf-8") as f:
            old = json.load(f)
    old_by_id = {c["id"]: c for c in old}
    new_by_id = {c["id"]: c for c in new}
    added = sorted(new_by_id[i]["player"]["name"] for i in new_by_id.keys() - old_by_id.keys())
    dropped = sorted(old_by_id[i]["player"]["name"] for i in old_by_id.keys() - new_by_id.keys())
    moved = sorted(f"{new_by_id[i]['player']['name']} ({old_by_id[i]['player']['team']} -> {new_by_id[i]['player']['team']})"
                   for i in new_by_id.keys() & old_by_id.keys()
                   if new_by_id[i]["player"]["team"] != old_by_id[i]["player"]["team"])
    order = ["Mythic", "Rare", "Uncommon", "Common"]
    rc_new, rc_old = Counter(c["rarity"] for c in new), Counter(c["rarity"] for c in old)
    lines = [
        f"## Card set {version}",
        "",
        f"{len(new)} cards (previous set: {len(old)}).",
        "",
        "| Rarity | Previous | Now |",
        "|---|---|---|",
        *[f"| {r} | {rc_old.get(r, 0)} | {rc_new.get(r, 0)} |" for r in order],
        "",
        f"**Added ({len(added)}):** {', '.join(added) or 'none'}",
        "",
        f"**Dropped ({len(dropped)}):** {', '.join(dropped) or 'none'}",
        "",
        f"**Changed team ({len(moved)}):** {', '.join(moved) or 'none'}",
    ]
    return "\n".join(lines) + "\n"


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # player names carry accents (Windows consoles are cp1252)
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-scrape", action="store_true", help="rebuild from snapshots on disk; no freeze, no bump")
    ap.add_argument("--summary", help="also write the summary markdown to this file")
    args = ap.parse_args()

    with open(os.path.join(DATA, "season_config.json"), encoding="utf-8") as f:
        season = json.load(f)["current"]
    old = read_version()
    previous_path = os.path.join(CARDSETS, f"{old}.json")

    if args.skip_scrape:
        version = old
        frozen = sorted((f[:-5] for f in os.listdir(CARDSETS) if f.endswith(".json")), key=version_key, reverse=True)
        previous_path = os.path.join(CARDSETS, f"{frozen[0]}.json") if frozen else None
    else:
        version = next_version(old, season)
        freeze(old)
        write_version(version)
        print(f"CARD_SET_VERSION {old} -> {version}")
        run(["node", "download_bref.js"], DATA)
        run([sys.executable, "fetch_bio.py"], DATA)

    run([sys.executable, "fetch_players.py"], DATA)
    if not args.skip_scrape:
        run([sys.executable, "download_images.py"], DATA)
    run(["npm", "run", "build:cards"], ROOT)
    if not args.skip_scrape:
        run(["node", "refresh_stats.js"], DATA)

    text = summary(previous_path, version)
    print("\n" + text)
    if args.summary:
        with open(args.summary, "w", encoding="utf-8") as f:
            f.write(text)


if __name__ == "__main__":
    main()
