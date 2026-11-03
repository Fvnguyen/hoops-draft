import json
import os
import sys
import time
import requests
import pandas as pd
from bs4 import BeautifulSoup
from unidecode import unidecode

# Use a realistic User-Agent to avoid immediate 403s from B-Ref
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def get_bref_table(html_content, table_id):
    import io
    dfs = pd.read_html(io.StringIO(html_content))
    
    # B-Ref has multiple tables, find the one with the correct columns
    target_df = None
    for df in dfs:
        if 'Player' in df.columns and ('PTS' in df.columns or 'PER' in df.columns):
            target_df = df
            break
            
    if target_df is None:
        raise Exception(f"Could not find a valid player table in HTML")
        
    df = target_df
    # Remove header rows that get repeated in B-Ref tables
    if 'Rk' in df.columns:
        df = df[df['Rk'] != 'Rk']
    
    return df


# ── NBA id resolution ────────────────────────────────────────────────────────
# basketball-reference names drop generational suffixes ("Ron Holland", "Robert
# Williams") while the NBA list carries them ("Ronald Holland II", "Robert Williams III")
# and also holds every retired namesake. A plain name lookup therefore lands on the
# wrong (inactive) player and the headshot CDN serves the wrong face or a placeholder.
# Resolution order: exact normalised match among ACTIVE players -> fuzzy match among
# active players -> exact match among inactive players (a retired player with a real
# card) -> None (the caller falls back to a hash id).

_SUFFIX_RE = None

def normalise_player_name(name):
    """lower-case, ASCII, no punctuation, no Jr/Sr/II/III/IV suffix, single spaces."""
    global _SUFFIX_RE
    import re
    if _SUFFIX_RE is None:
        _SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b")
    from unidecode import unidecode
    n = unidecode(name).lower().replace('.', ' ').replace("'", '').replace('-', ' ')
    n = _SUFFIX_RE.sub(' ', n)
    return ' '.join(n.split())

def build_nba_index(nba_players):
    """{'active': {norm: id}, 'inactive': {norm: id}} from nba_api's static player list."""
    active, inactive = {}, {}
    for p in nba_players:
        key = normalise_player_name(p['full_name'])
        bucket = active if p.get('is_active') else inactive
        bucket.setdefault(key, str(p['id']))
    return {'active': active, 'inactive': inactive}

def resolve_nba_id(name, index, cutoff=0.85):
    import difflib
    key = normalise_player_name(name)
    if key in index['active']:
        return index['active'][key]
    close = difflib.get_close_matches(key, list(index['active'].keys()), n=1, cutoff=cutoff)
    if close:
        return index['active'][close[0]]
    return index['inactive'].get(key)


# Deterministic sort for a '/'-joined or '-'-joined position string, e.g. 'SG/PG' -> 'PG/SG'.
def sort_pos(p_str):
    order = {'PG': 1, 'SG': 2, 'SF': 3, 'PF': 4, 'C': 5, 'G': 1, 'F': 3}
    parts = p_str.replace('-', '/').split('/')
    parts.sort(key=lambda x: order.get(x, 99))
    return "/".join(parts)


class PositionResolver:
    """D10 follow-up (2026-09-19, owner-designed after analysis of all 582 active
    players — see data/analyze_positions.py). Rules locked:

    - PRIMARY is always basketball-reference's season `Pos` column (2025-26-specific,
      always a single specific position). Never the bio text, never a fallback guess.
    - ELIGIBILITY is the full position set parsed from the player's own bref bio page
      ("Position: X[, Y][, and Z]" in the #meta block), scraped into
      `bref_player_positions.json` by download_bref.js. Verified over the full pool:
        - primary was a member of this set 100% of the time (579/579 with bio text
          present, 0 conflicts) -> no reconciliation logic needed, union is a no-op in
          practice, kept as a safety net
        - all but 3 of 582 (Amen Thompson, Russell Westbrook, Jalen Williams - genuinely
          non-contiguous per bref's own text, e.g. "PG/SF" skipping SG) were a contiguous
          PG-SG-SF-PF-C chain -> no ADJACENT-hop inference or gap-filling needed, bref's
          text is trusted verbatim either way
        - distribution ~68% single / ~29% two-way / ~2% three-way / <1% four-or-five-way
          (e.g. LeBron James parses to all 5) -> NOT disproportionate at the pool level,
          so no rating-based trim/cut. A single outlier having many eligible columns is
          not "too many players" - only a skewed POOL-WIDE distribution would justify
          one, and this one isn't skewed.
    - MISSING bio text (bref's #meta block has no "Position:" line at all for that
      player - a real bref quirk confirmed by fetching Giannis Antetokounmpo's own page
      directly, not a scrape bug; 3/582 this run) falls back to a PERSISTED value first
      (see below), then primary-only eligibility. A Rare+ card with NO persisted value at
      all is flagged via `needs_hand_check` and logged to `REVIEW_MISSING_POSITIONS.md`.
      Uncommon/Common cards with missing bio text just use whatever fallback resolves,
      no review needed - not worth hand-checking bench depth.
    - PERSISTENCE (future ingestions, owner call 2026-09-19): a missing-bio-text player
      first checks `existing_positions` (read from the game.db this run is about to
      overwrite) before falling all the way back to season-Pos-only. Once a name has ANY
      stored value it stops being flagged for review, permanently - persistence IS the
      resolution mechanism here, not `POSITION_OVERRIDES` (that stays reserved for cases
      where a real signal source needs to be overruled, e.g. Jokic's bio page saying
      plain "Center" against his real "point-center" role - not for filling data gaps).
      A one-time direct edit to game.db's Player.position (e.g. Giannis -> 'SF/PF/C',
      2026-09-19, his bio page carries no Position line at all) flows into every future
      run's fallback for free, no code change needed.
    """

    _POS_WORD = {
        'Point Guard': 'PG', 'Shooting Guard': 'SG', 'Small Forward': 'SF',
        'Power Forward': 'PF', 'Center': 'C',
    }

    def __init__(self, bio_position_texts, rarity_by_name=None, existing_positions=None):
        self.bio_position_texts = bio_position_texts  # name -> raw "Position: ..." text
        self.rarity_by_name = rarity_by_name or {}     # name -> rarity, a PROXY from the
        # previously-built cards.json - position never feeds OVR/rarity, so a stale
        # rarity value is still a valid signal for "is this worth a human's time."
        self.existing_positions = existing_positions or {}  # name -> last-run's resolved
        # position string, read from game.db before this run overwrites it.
        self.hand_check_needed = []  # [(name, rarity, used_existing: bool)]
        self.auto_fallback_count = 0

    @classmethod
    def parse_bio_text(cls, text):
        """'Point Guard and Shooting Guard' -> ['PG', 'SG']; empty/unrecognized -> []."""
        if not text:
            return []
        import re as _re
        codes = []
        for part in _re.split(r',| and ', text):
            part = part.strip()
            if part in cls._POS_WORD and cls._POS_WORD[part] not in codes:
                codes.append(cls._POS_WORD[part])
        return codes

    def resolve(self, name, season_pos):
        """Returns the sort_pos'd eligibility string for the Player.position column.
        `season_pos` (bref's season Pos, e.g. 'SG') is the primary and is asserted into
        the set even though analysis found it's already always present."""
        bio_codes = self.parse_bio_text(self.bio_position_texts.get(name, ''))
        if bio_codes:
            codes = set(bio_codes)
            if season_pos:
                codes.add(season_pos)
            return sort_pos('/'.join(codes))

        # Missing bio text: fall back to a previously-resolved position (persistence,
        # future ingestions) before season-Pos-only. season_pos is still asserted into
        # whichever set we land on.
        prior = self.existing_positions.get(name, '')
        used_existing = bool(prior)
        codes = set(prior.split('/')) if prior else set()
        if season_pos:
            codes.add(season_pos)
        resolved = sort_pos('/'.join(codes)) if codes else ''

        rarity = self.rarity_by_name.get(name)
        if rarity in ('Mythic', 'Rare') and not used_existing:
            # Owner call (2026-09-19): only a genuinely NEW missing-bio Rare+ case (no
            # persisted value at all) needs a human. Once a name has ANY stored value -
            # whether from a careful one-time edit or a past auto-fallback - persistence
            # is the resolution mechanism going forward, not a recurring nag. This is
            # deliberately different from POSITION_OVERRIDES: an override is permanent
            # code, a stored value is just data that keeps flowing through game.db.
            self.hand_check_needed.append((name, rarity))
        else:
            self.auto_fallback_count += 1
        return resolved

    def write_review_note(self, path='REVIEW_MISSING_POSITIONS.md'):
        if not self.hand_check_needed:
            return
        lines = [
            '# Missing bref bio position - manual review needed\n',
            f'Generated by fetch_players.py ({len(self.hand_check_needed)} Rare+ cards with '
            f'no "Position:" line on their own bref page AND no persisted value from a '
            f'previous run). {self.auto_fallback_count} cards had the same missing-text gap '
            f'but either aren\'t Rare+ or already have a stored value - no review needed.\n',
        ]
        for name, rarity in sorted(self.hand_check_needed, key=lambda x: x[0]):
            lines.append(f'- [ ] **{name}** ({rarity}) — season Pos only, never resolved before; edit `frontend/game.db`\'s Player.position directly (it persists into next run\'s fallback) or add to `POSITION_OVERRIDES`\n')
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Wrote {path}: {len(self.hand_check_needed)} Rare+ players need a manual position check")


SEASON_CONFIG_PATH = "season_config.json"

# major_awards has no scrape source (MVP/ROTY/DPOY/MIP are not on bref's league page in a
# stable place) and needs manual upkeep: add the newest season once it is announced.
MAJOR_AWARDS = {
    '2025-26': {
        'Shai Gilgeous-Alexander': ['MVP'],
        'Cooper Flagg': ['ROTY'],
        'Victor Wembanyama': ['DPOY'],
        'Nickeil Alexander-Walker': ['MIP'],
    },
    '2024-25': {
        'Shai Gilgeous-Alexander': ['MVP'],
        'Stephon Castle': ['ROTY'],
        'Evan Mobley': ['DPOY'],
        'Dyson Daniels': ['MIP'],
    },
}

# card_balance T2, owner hand-roll (2026-09-16): bref's season Pos and his own bio page both
# give Jokic a plain 'C', but as a "point-center" he should be slottable at PF without a
# depth-chart penalty. Keyed by the unidecode'd ASCII name used everywhere else.
POSITION_OVERRIDES = {
    'Nikola Jokic': 'PF/C',
}

NUMERIC_COLS = ['Age', 'G', 'GS', 'MP', 'PTS', 'TRB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FGA', '3PA', '3P', 'FG', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TOV', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP', '2PA', '2P%',
                '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P',
                'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P',
                'USG%', 'AST%', 'TOV%', 'STL%', 'BLK%', 'ORB%', 'DRB%', 'TRB%', 'OBPM', 'DWS', 'WS/48',
                "% of FG Ast'd_2P", "% of FG Ast'd_3P"]


def load_season(season):
    """One season's per-game + advanced + shooting tables from data/bref/<season>/, merged
    on Player, one row per player (a traded player's combined 2TM/3TM row, listed first).
    No games filter: eligibility lives in ratings.ts (season_2026_27 D2/D3)."""
    import io
    d = os.path.join("bref", season)
    with open(os.path.join(d, "per_game.html"), encoding="utf-8") as f:
        df_per_game = get_bref_table(f.read(), "per_game_stats")
    with open(os.path.join(d, "advanced.html"), encoding="utf-8") as f:
        df_advanced = get_bref_table(f.read(), "advanced_stats")
    with open(os.path.join(d, "shooting.html"), encoding="utf-8") as f:
        dfs = pd.read_html(io.StringIO(f.read()))
    df_shooting = None
    for df in dfs:
        if len(df.columns) > 15 and ('Unnamed: 1_level_0', 'Player') in df.columns:
            df_shooting = df
            break
    if df_shooting is None:
        raise Exception(f"{season}: no shooting table")
    df_shooting.columns = [col[1] if col[0].startswith('Unnamed') else f"{col[0]}_{col[1]}" for col in df_shooting.columns]

    df_per_game = df_per_game[df_per_game['Player'] != 'League Average']
    df_per_game = df_per_game.drop_duplicates(subset=['Player'], keep='first')
    df_advanced = df_advanced.drop_duplicates(subset=['Player'], keep='first')
    df_shooting = df_shooting.drop_duplicates(subset=['Player'], keep='first')

    # card_ratings_rebalance D1 (2026-09-18): the 13 advanced columns D3-D6's rate-stat
    # formulas need, plus the shooting table's assisted-FG% (the D4 self-creation term).
    df = pd.merge(df_per_game, df_advanced[[
        'Player', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP', 'USG%', 'AST%', 'TOV%', 'STL%',
        'BLK%', 'ORB%', 'DRB%', 'TRB%', 'OBPM', 'DWS', 'WS/48',
    ]], on='Player', how='inner')
    df = pd.merge(df, df_shooting[[
        'Player', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10',
        '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P',
        'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16',
        'FG% by Distance_16-3P', 'FG% by Distance_3P',
        "% of FG Ast'd_2P", "% of FG Ast'd_3P",
    ]], on='Player', how='left')

    for col in NUMERIC_COLS:
        if col not in df.columns:
            df[col] = 0
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    df = df[df['G'] >= 1]
    print(f"{season}: {len(df)} players, max GP {int(df['G'].max())}")
    return df


def load_awards(season):
    """[(ascii name, award name, level)] from data/bref/<season>/awards.html plus the
    hand-kept MAJOR_AWARDS. Names are unidecode'd: bref's anchor text keeps accents
    ('Luka Dončić'), which silently failed the lookup once (card_balance T2, 2026-09-16)."""
    out = []
    path = os.path.join("bref", season, "awards.html")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        div_all_nba = soup.find('div', id='div_all-nba')
        if div_all_nba:
            for div_team in div_all_nba.find_all('div', class_='data_grid_box'):
                level = 1 if '1' in div_team.get('id', '') else (2 if '2' in div_team.get('id', '') else 3)
                for a in div_team.find_all('a'):
                    if '/players/' in a.get('href', ''):
                        out.append((unidecode(a.text.strip()), 'All-NBA', level))
        div_all_def = soup.find('div', id='div_all-defensive')
        if div_all_def:
            for div_team in div_all_def.find_all('div', class_='data_grid_box'):
                level = 1 if '1' in div_team.get('id', '') else 2
                for a in div_team.find_all('a'):
                    if '/players/' in a.get('href', ''):
                        out.append((unidecode(a.text.strip()), 'All-Defensive', level))
    for name, names in MAJOR_AWARDS.get(season, {}).items():
        for aw in names:
            out.append((name, aw, None))
    print(f"{season} awards: {sum(1 for a in out if a[1] == 'All-NBA')} All-NBA, "
          f"{sum(1 for a in out if a[1] == 'All-Defensive')} All-Defensive, "
          f"{sum(1 for a in out if a[2] is None)} major")
    return out


def stat_row(real_id, season, row):
    f = lambda k: float(row.get(k, 0) or 0)
    return (
        real_id, season, int(row['G']), int(row.get('GS', 0)), f('MP'), round(f('PTS'), 1), round(f('TRB'), 1),
        round(f('AST'), 1), round(f('STL'), 1), round(f('BLK'), 1), f('FGA'),
        f('3PA'), f('2PA'), round(f('FG%'), 3), round(f('3P%'), 3),
        round(f('2P%'), 3), round(f('FT%'), 3), round(f('PER'), 1),
        round(f('TS%'), 3), round(f('VORP'), 1), round(f('DBPM'), 1), round(f('TOV'), 1),
        f('% of FGA by Distance_0-3'), f('% of FGA by Distance_3-10'), f('% of FGA by Distance_10-16'), f('% of FGA by Distance_16-3P'), f('% of FGA by Distance_3P'),
        f('FG% by Distance_0-3'), f('FG% by Distance_3-10'), f('FG% by Distance_10-16'), f('FG% by Distance_16-3P'), f('FG% by Distance_3P'),
        round(f('USG%') / 100.0, 4), round(f('AST%') / 100.0, 4),
        round(f('TOV%') / 100.0, 4), round(f('STL%') / 100.0, 4),
        round(f('BLK%') / 100.0, 4), round(f('ORB%') / 100.0, 4),
        round(f('DRB%') / 100.0, 4), round(f('TRB%') / 100.0, 4),
        round(f('OBPM'), 2), round(f('DWS'), 2), round(f('WS/48'), 4),
        round(f("% of FG Ast'd_2P"), 4), round(f("% of FG Ast'd_3P"), 4),
    )


def fetch_and_generate_players():
    """season_2026_27 D1/D2: the player universe is the current season's NBA rosters
    (bio.csv, from fetch_bio.py), each on his CURRENT team. Every season in
    season_config.json contributes one SeasonStat row per rostered player who played in it
    (GP >= 1); awards are stored per season. Which rows make a card, and how they blend,
    is decided in frontend/src/engine/ratings.ts."""
    import sqlite3
    import difflib

    with open(SEASON_CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)
    seasons = [config['current']] + config['priors']

    season_dfs = {s: load_season(s) for s in seasons}
    season_awards = {s: load_awards(s) for s in config['priors']}

    # Roster: NBA id -> bio (current team, height, weight, age).
    df_bio = pd.read_csv("bio.csv")
    roster = {}
    roster_by_name = {}
    for _, row in df_bio.iterrows():
        pid = str(int(row['PLAYER_ID']))
        roster[pid] = {
            "name": unidecode(row['PLAYER']),
            "team": row['TEAM_ABBR'],
            "height": str(row['HEIGHT']),
            "weight": int(row['WEIGHT']) if pd.notna(row['WEIGHT']) else 0,
            "age": int(row['AGE']) if pd.notna(row['AGE']) else 0,
        }
        roster_by_name[normalise_player_name(row['PLAYER'])] = pid
    print(f"Roster: {len(roster)} players")

    nba_index = {'active': {}, 'inactive': {}}
    try:
        from nba_api.stats.static import players
        nba_index = build_nba_index(players.get_players())
    except Exception as e:
        print("Could not load the NBA player index (name matching only):", e)

    def roster_id_for(bref_name):
        """bref name -> rostered NBA id: exact normalised roster name, then the NBA id
        index, then a close roster-name match. None = not on a current roster."""
        key = normalise_player_name(bref_name)
        if key in roster_by_name:
            return roster_by_name[key]
        nid = resolve_nba_id(bref_name, nba_index)
        if nid in roster:
            return nid
        close = difflib.get_close_matches(key, list(roster_by_name.keys()), n=1, cutoff=0.9)
        return roster_by_name[close[0]] if close else None

    # id -> {season: row}, plus the bref display name (accents kept) and latest season Pos.
    rows_by_id = {}
    display_name = {}
    latest_pos = {}
    unmatched = []
    for s in seasons:  # current first, so the newest name/Pos wins
        for _, row in season_dfs[s].iterrows():
            raw_name = str(row['Player']).replace('*', '')
            pid = roster_id_for(raw_name)
            if pid is None:
                if s == config['current'] and float(row['MP']) >= 15:
                    unmatched.append(raw_name)
                continue
            rows_by_id.setdefault(pid, {})[s] = row
            display_name.setdefault(pid, raw_name)
            if pd.notna(row.get('Pos')) and pid not in latest_pos:
                latest_pos[pid] = str(row['Pos']).strip()
    if unmatched:
        print(f"WARNING: {len(unmatched)} current-season players (MPG >= 15) not matched to a roster: {unmatched}")
    no_stats = [roster[p]['name'] for p in roster if p not in rows_by_id]
    print(f"Rostered players with no NBA game in {', '.join(seasons)}: {len(no_stats)} (no card)")

    # D10 follow-up (2026-09-19): see PositionResolver's docstring for the locked rules.
    bio_position_texts = {}
    try:
        with open('bref_player_positions.json', 'r', encoding='utf-8') as f:
            bio_position_texts = {unidecode(k): v for k, v in json.load(f).items()}
        print(f"Loaded bref per-player bio positions: {len(bio_position_texts)} players")
    except Exception as e:
        print(f"Could not load bref_player_positions.json (every player falls back to season Pos only): {e}")

    rarity_by_name = {}
    try:
        with open('../frontend/src/data/cards.json', 'r', encoding='utf-8') as f:
            for c in json.load(f):
                rarity_by_name[c['player']['name']] = c['rarity']
    except Exception as e:
        print(f"No previous cards.json for rarity cross-ref: {e}")

    existing_positions = {}
    try:
        _prev = sqlite3.connect("../frontend/game.db")
        for _name, _pos in _prev.execute("SELECT name, position FROM Player"):
            existing_positions[unidecode(_name)] = _pos
        _prev.close()
        print(f"Loaded {len(existing_positions)} previously-resolved positions from game.db")
    except Exception as e:
        print(f"No previous game.db to read positions from: {e}")

    position_resolver = PositionResolver(bio_position_texts, rarity_by_name, existing_positions)

    conn = sqlite3.connect("../frontend/game.db")
    c = conn.cursor()
    c.executescript("""
    DROP TABLE IF EXISTS Player;
    DROP TABLE IF EXISTS SeasonStat;
    DROP TABLE IF EXISTS Award;

    CREATE TABLE Player (
        id TEXT PRIMARY KEY, name TEXT, position TEXT, height TEXT, weight INTEGER, age INTEGER, team TEXT
    );

    CREATE TABLE SeasonStat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT, season TEXT,
        gp INTEGER, gs INTEGER, mpg REAL, pts REAL, trb REAL, ast REAL, stl REAL, blk REAL,
        fga REAL, fg3a REAL, fg2a REAL, fg_pct REAL, fg3_pct REAL, fg2_pct REAL, ft_pct REAL,
        per REAL, ts REAL, vorp REAL, dbpm REAL, tov REAL,
        pct_fga_0_3 REAL, pct_fga_3_10 REAL, pct_fga_10_16 REAL, pct_fga_16_3p REAL, pct_fga_3p REAL,
        fg_pct_0_3 REAL, fg_pct_3_10 REAL, fg_pct_10_16 REAL, fg_pct_16_3p REAL, fg_pct_3p REAL,
        usg_pct REAL, ast_pct REAL, tov_pct REAL, stl_pct REAL, blk_pct REAL, orb_pct REAL,
        drb_pct REAL, trb_pct REAL, obpm REAL, dws REAL, ws_per_48 REAL,
        pct_ast_fg2 REAL, pct_ast_fg3 REAL,
        FOREIGN KEY(playerId) REFERENCES Player(id)
    );

    CREATE TABLE Award (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT, season TEXT, name TEXT, level INTEGER,
        FOREIGN KEY(playerId) REFERENCES Player(id)
    );
    """)

    name_to_id = {}
    players_json = []
    for pid in sorted(rows_by_id):
        bio = roster[pid]
        raw_name = display_name[pid]
        name = unidecode(raw_name)
        name_to_id[name] = pid
        name_to_id.setdefault(bio['name'], pid)
        pos = position_resolver.resolve(name, latest_pos.get(pid, ""))
        pos = POSITION_OVERRIDES.get(name, pos)
        c.execute("INSERT INTO Player (id, name, position, height, weight, age, team) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  (pid, raw_name, pos, bio['height'], bio['weight'], bio['age'], bio['team']))
        for s, row in rows_by_id[pid].items():
            c.execute("""
                INSERT INTO SeasonStat (
                    playerId, season, gp, gs, mpg, pts, trb, ast, stl, blk, fga, fg3a, fg2a, fg_pct, fg3_pct, fg2_pct, ft_pct, per, ts, vorp, dbpm, tov,
                    pct_fga_0_3, pct_fga_3_10, pct_fga_10_16, pct_fga_16_3p, pct_fga_3p,
                    fg_pct_0_3, fg_pct_3_10, fg_pct_10_16, fg_pct_16_3p, fg_pct_3p,
                    usg_pct, ast_pct, tov_pct, stl_pct, blk_pct, orb_pct, drb_pct, trb_pct, obpm, dws, ws_per_48,
                    pct_ast_fg2, pct_ast_fg3
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, stat_row(pid, s, row))
        players_json.append({"id": pid, "name": raw_name, "rarity": "Common"})

    award_count = 0
    for s, awards in season_awards.items():
        for name, aw, level in awards:
            pid = name_to_id.get(name)
            if pid:
                c.execute("INSERT INTO Award (playerId, season, name, level) VALUES (?, ?, ?, ?)", (pid, s, aw, level))
                award_count += 1
    print(f"Inserted {award_count} awards for rostered players")

    conn.commit()
    conn.close()
    position_resolver.write_review_note()

    with open('players.json', 'w', encoding='utf-8') as f:
        json.dump(players_json, f, indent=2, ensure_ascii=False)

    print("Database created at frontend/game.db")
    print(f"Successfully generated {len(players_json)} players in players.json")

if __name__ == "__main__":
    fetch_and_generate_players()
