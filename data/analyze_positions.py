"""Re-verification tool for PositionResolver's locked rules (fetch_players.py) —
run from data/ any time bref_player_positions.json is refreshed (new season) to confirm
the position-count distribution, primary-containment, and adjacency findings still hold
before trusting the resolver's output blind. Not part of the automated pipeline.
"""
import json
import re
import io
import sys
import pandas as pd
from unidecode import unidecode

_POS_WORD = {'Point Guard': 'PG', 'Shooting Guard': 'SG', 'Small Forward': 'SF', 'Power Forward': 'PF', 'Center': 'C'}
ORDER = ['PG', 'SG', 'SF', 'PF', 'C']


def parse(text):
    if not text:
        return []
    codes = []
    for part in re.split(r',| and ', text):
        part = part.strip()
        if part in _POS_WORD and _POS_WORD[part] not in codes:
            codes.append(_POS_WORD[part])
    codes.sort(key=lambda x: ORDER.index(x))
    return codes


def main():
    with open('per_game.html', encoding='utf-8') as f:
        per_game_html = f.read()
    dfs = pd.read_html(io.StringIO(per_game_html))
    target = None
    for df in dfs:
        if 'Player' in df.columns and 'Pos' in df.columns:
            target = df
            break
    df = target[target['Rk'] != 'Rk'] if 'Rk' in target.columns else target
    df = df.drop_duplicates(subset=['Player'], keep='first')
    season_pos = {}
    for _, row in df.iterrows():
        name = unidecode(str(row['Player']).replace('*', ''))
        season_pos[name] = str(row['Pos']).strip()

    with open('bref_player_positions.json', encoding='utf-8') as f:
        raw = json.load(f)

    # Optional: cross-reference against the CURRENT built cards.json for rarity (position
    # doesn't feed rarity/OVR at all, so the existing pool's rarity is a valid proxy even
    # though positions.json will change under it).
    rarity_by_name = {}
    try:
        with open('../frontend/src/data/cards.json', encoding='utf-8') as f:
            cards = json.load(f)
        for c in cards:
            rarity_by_name[c['player']['name']] = c['rarity']
    except Exception as e:
        print(f"(no cards.json rarity cross-ref: {e})", file=sys.stderr)

    n = len(raw)
    count_dist = {}
    primary_in_set = 0
    primary_not_in_set = 0
    non_adjacent = 0
    conflict_examples = []
    combo_counts = {}
    missing = []

    for name, text in raw.items():
        codes = parse(text)
        k = len(codes)
        count_dist[k] = count_dist.get(k, 0) + 1
        if k == 0:
            missing.append(name)
            continue
        combo = '/'.join(codes)
        combo_counts[combo] = combo_counts.get(combo, 0) + 1
        sp = season_pos.get(unidecode(name), '')
        if sp in codes:
            primary_in_set += 1
        else:
            primary_not_in_set += 1
            conflict_examples.append((name, combo, sp))
        if k >= 2:
            idxs = sorted(ORDER.index(c) for c in codes)
            is_contig = all(idxs[i + 1] - idxs[i] == 1 for i in range(len(idxs) - 1))
            if not is_contig:
                non_adjacent += 1

    print(f'total parsed: {n} (missing: {len(missing)})')
    print('count distribution (# positions from bio text):', dict(sorted(count_dist.items())))
    print('primary season Pos IS in bio-text set:', primary_in_set)
    print('primary season Pos NOT in bio-text set:', primary_not_in_set)
    print('non-adjacent (gapped) combos among k>=2:', non_adjacent)
    print()
    print('combo frequency:')
    for combo, cnt in sorted(combo_counts.items(), key=lambda x: -x[1]):
        print(' ', combo, cnt)
    print()
    if conflict_examples:
        print('CONFLICTS (season Pos not in bio-text set):')
        for c in conflict_examples:
            print(' ', c)
        print()

    print(f'MISSING bio position ({len(missing)}) — rarity from current cards.json:')
    rare_plus = []
    common_ish = []
    for m in sorted(missing):
        rarity = rarity_by_name.get(m, 'NOT IN 448-CARD POOL')
        print(f'  {m:<28} {rarity}')
        if rarity in ('Mythic', 'Rare'):
            rare_plus.append((m, rarity))
        elif rarity in ('Uncommon', 'Common'):
            common_ish.append((m, rarity))
    print()
    print(f'=> HAND-CHECK NEEDED ({len(rare_plus)} Rare+):', [m for m, _ in rare_plus])
    print(f'=> AUTO FALLBACK to season Pos ({len(common_ish)} Uncommon/Common):', [m for m, _ in common_ish])


if __name__ == '__main__':
    main()
