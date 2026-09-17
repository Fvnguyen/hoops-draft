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


def fetch_and_generate_players():
    # Read from local files saved by playwright
    print("Reading local HTML files...")
    
    # 1. Per Game Stats
    with open("per_game.html", "r", encoding="utf-8") as f:
        per_game_html = f.read()
    df_per_game = get_bref_table(per_game_html, "per_game_stats")
    
    # 2. Advanced Stats
    with open("advanced.html", "r", encoding="utf-8") as f:
        advanced_html = f.read()
    df_advanced = get_bref_table(advanced_html, "advanced_stats")
    

    # 3. Shooting Stats
    with open("shooting.html", "r", encoding="utf-8") as f:
        shooting_html = f.read()
    import io
    import pandas as pd
    dfs = pd.read_html(io.StringIO(shooting_html))
    df_shooting = None
    for df in dfs:
        if len(df.columns) > 15 and ('Unnamed: 1_level_0', 'Player') in df.columns:
            df_shooting = df
            break
            
    # Flatten MultiIndex
    df_shooting.columns = [col[1] if col[0].startswith('Unnamed') else f"{col[0]}_{col[1]}" for col in df_shooting.columns]
    


    # Clean data (handled by numeric conversion below)
    
    # For players traded mid-season, B-Ref lists them multiple times (TOT, and then each team).
    # We want to keep the 'TOT' (Total) row for stats, but we need their actual latest team.
    # The 'TOT' row appears first, so we can drop duplicates by Player name, keeping the first (TOT),
    # but we should capture their latest team from the last row.
    
    # Get latest team mapping
    latest_teams = df_per_game.drop_duplicates(subset=['Player'], keep='last').set_index('Player')['Team'].to_dict()
    
    # Get TOT (or only) row for stats
    df_per_game = df_per_game.drop_duplicates(subset=['Player'], keep='first')
    df_advanced = df_advanced.drop_duplicates(subset=['Player'], keep='first')
    
    # Merge datasets
    # card_ratings_rebalance D1 (2026-09-18): widened from PER/TS%/BPM/DBPM/VORP to the
    # 13 columns D3-D6's rate-stat formulas need — usg_pct/ast_pct/tov_pct/stl_pct/
    # blk_pct/orb_pct/drb_pct/trb_pct/obpm/dws/ws_per_48 from the advanced table (already
    # scraped, never read past this point before) plus pct_ast_fg2/pct_ast_fg3 from the
    # shooting table (never merged in at all — the self-creation term in D4 needs it).
    df = pd.merge(df_per_game, df_advanced[[
        'Player', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP', 'USG%', 'AST%', 'TOV%', 'STL%',
        'BLK%', 'ORB%', 'DRB%', 'TRB%', 'OBPM', 'DWS', 'WS/48',
    ]], on='Player', how='inner')

    # Correctly merge shooting here!
    df_shooting = df_shooting.drop_duplicates(subset=['Player'])
    df = pd.merge(df, df_shooting[[
        'Player', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10',
        '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P',
        'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16',
        'FG% by Distance_16-3P', 'FG% by Distance_3P',
        "% of FG Ast'd_2P", "% of FG Ast'd_3P",
    ]], on='Player', how='left')


    # Convert numeric columns
    # card_balance T2 (2026-09-17, owner-approved): GS (games started) added - the real
    # starter signal for T2's Uncommon rarity floor, replacing a 30 MPG proxy that misses
    # real starters who just play a lower-minutes role (real starters 180 vs the 30 MPG
    # proxy's 80, checked in the plan).
    numeric_cols = ['Age', 'G', 'GS', 'MP', 'PTS', 'TRB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FGA', '3PA', '3P', 'FG', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TOV', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P',
                    'USG%', 'AST%', 'TOV%', 'STL%', 'BLK%', 'ORB%', 'DRB%', 'TRB%', 'OBPM', 'DWS', 'WS/48',
                    "% of FG Ast'd_2P", "% of FG Ast'd_3P"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        
    print(f"Total players found: {len(df)}")
    
    # Filter: >= 20 GP and >= 5.0 MPG
    # If it's early in the season and no one has 20 GP, we might need to fallback.
    max_gp = df['G'].max()
    print(f"Maximum games played by any player: {max_gp}")
    
    if max_gp < 20:
        print("WARNING: Season 2025-26 has not reached 20 games yet! Using data as-is, but rarity might be skewed.")
    
    df_filtered = df[(df['G'] >= 20) & (df['MP'] >= 5.0)].copy()
    print(f"Players remaining after filters (GP>=20, MP>=5.0): {len(df_filtered)}")
    
    all_nba_players = {}
    all_defensive_players = {}
    all_star_players = set()
    
    try:
        with open("awards.html", "r", encoding="utf-8") as f:
            awards_html = f.read()
        soup = BeautifulSoup(awards_html, 'html.parser')
        
        # Scrape All-NBA. Names are unidecode'd to match the ASCII lookup key used at
        # insert time (`name = unidecode(raw_name)`) — bref's anchor text keeps accents
        # (e.g. 'Luka Dončić'), which silently failed the `name in all_nba_players` check
        # and dropped the award (card_balance T2 finding, 2026-09-16).
        div_all_nba = soup.find('div', id='div_all-nba')
        if div_all_nba:
            for div_team in div_all_nba.find_all('div', class_='data_grid_box'):
                team_level = 1 if '1' in div_team.get('id', '') else (2 if '2' in div_team.get('id', '') else 3)
                for a in div_team.find_all('a'):
                    if '/players/' in a.get('href', ''):
                        all_nba_players[unidecode(a.text.strip())] = team_level

        # Scrape All-Defensive
        div_all_def = soup.find('div', id='div_all-defensive')
        if div_all_def:
            for div_team in div_all_def.find_all('div', class_='data_grid_box'):
                team_level = 1 if '1' in div_team.get('id', '') else 2
                for a in div_team.find_all('a'):
                    if '/players/' in a.get('href', ''):
                        all_defensive_players[unidecode(a.text.strip())] = team_level

        # Scrape All-Star
        div_all_star = soup.find('div', id='div_all_star_game_rosters')
        if div_all_star:
            for a in div_all_star.find_all('a'):
                if '/players/' in a.get('href', ''):
                    all_star_players.add(unidecode(a.text.strip()))
                    
    except Exception as e:
        print(f"Could not read local awards html: {e}")

    print(f"Scraped awards: {len(all_nba_players)} All-NBA, {len(all_defensive_players)} "
          f"All-Defensive, {len(all_star_players)} All-Star")

    # Calculate Raw Scores for Dimensions
    df_filtered['3PM'] = df_filtered['3P']
    df_filtered['2PM'] = df_filtered['FG'] - df_filtered['3P']
    df_filtered['2P%'] = df_filtered['2PM'] / (df_filtered['FGA'] - df_filtered['3PA']).replace(0, 1)
    df_filtered['FT%'] = df_filtered['FT%'].fillna(0)
    df_filtered['FTr'] = (df_filtered['FTA'] / df_filtered['FGA'].replace(0, 1)).fillna(0)
    
    # We heavily weight volume averages (PTS, AST, TRB, etc.) to ensure high-minutes production
    # trumps low-minutes extreme efficiency.
    df_filtered['Shooting_Raw'] = (df_filtered['PTS'] * 2.0) + (df_filtered['3PM'] * 10.0) + (df_filtered['3P%'] * 50) + (df_filtered['FT%'] * 25)
    df_filtered['Inside_Raw'] = (df_filtered['PTS'] * 2.0) + (df_filtered['2PM'] * 5.0) + (df_filtered['2P%'] * 50) + (df_filtered['FTr'] * 25)
    df_filtered['Playmaking_Raw'] = (df_filtered['AST'] * 8.0) + (df_filtered['AST'] / df_filtered['TOV'].replace(0, 0.1))
    df_filtered['Rebounding_Raw'] = (df_filtered['TRB'] * 6.0) + (df_filtered['ORB'] * 2.0)
    # NOTE: this Shooting/Inside/Playmaking/Rebounding/PerimDef/PostDef_Raw block (and its
    # 40-99 percentile scaling just below) is DEAD CODE as of card_balance T2
    # (2026-09-16 finding): ratings.ts computes finishing/midRange/perimeter/playmaking/
    # rebounding/perimeterDefense/postDefense independently from SeasonStat's raw columns
    # (stl, blk, dbpm, ...) via its own getIndex/scaleRaw benchmark-ratio pipeline; none of
    # these Python-scaled columns are written to game.db or read anywhere downstream. A
    # DBPM small-sample fix was tried here first and reverted when this was discovered -
    # it never reached the real formula. The real fix lives in ratings.ts (capLowMinutes).
    # Left in place rather than deleted (cleanup is a separate T2 task, not this fix).
    df_filtered['PerimDef_Raw'] = (df_filtered['STL'] * 15.0) + (df_filtered['DBPM'] * 5.0)
    df_filtered['PostDef_Raw'] = (df_filtered['BLK'] * 15.0) + (df_filtered['DBPM'] * 5.0)
    
    # Calculate Percentiles & 40-99 Scale
    for dim in ['Shooting', 'Inside', 'Playmaking', 'Rebounding', 'PerimDef', 'PostDef']:
        raw_col = f'{dim}_Raw'
        pct_col = f'{dim}_Pct'
        df_filtered[pct_col] = df_filtered[raw_col].rank(pct=True)
        # Use a cubic curve so 90+ is strictly reserved for the top ~5-10%
        df_filtered[dim] = 40 + (df_filtered[pct_col] ** 2.5) * 59.0
        df_filtered[dim] = df_filtered[dim].round().astype(int)
            
    df_filtered['PER_Pct'] = df_filtered['PER'].rank(pct=True)
    df_filtered['VORP_Pct'] = df_filtered['VORP'].rank(pct=True)
    # Calculate Overall Combo Rank for Rarity
    df_filtered['Combo_Rank'] = (df_filtered['PER_Pct'] + df_filtered['VORP_Pct']) / 2.0
    
    # 3. Load Hard Bio Data
    df_bio = pd.read_csv("bio.csv")

    # Deterministic sorting for positions (module scope: used for both the NBA Stats
    # bio position below and basketball-reference's Pos column at insert time, D1).
    def sort_pos(p_str):
        order = {'PG': 1, 'SG': 2, 'SF': 3, 'PF': 4, 'C': 5, 'G': 1, 'F': 3}
        parts = p_str.replace('-', '/').split('/')
        parts.sort(key=lambda x: order.get(x, 99))

        # Standardize G/F to SG/SF etc if we want, but B-Ref gives exact F-G which we sort to G/F
        return "/".join(parts)

    # card_balance T1 follow-up (2026-09-16): bref's Pos this season is always a single
    # specific position (no combos), which on its own would leave every card eligible
    # for exactly one depth-chart column (engine/positions.ts naturalPositions) — a real
    # loss of the multi-position flexibility players actually have. The NBA Stats bio
    # position (broad G/F/C, sometimes a combo like G-F) still carries that signal, so we
    # blend it in as ONE adjacent crossover column, never a wholesale replacement of the
    # bref primary. Mirrors engine/positions.ts's ADJACENT map — keep both in sync.
    _SIDE = {'PG': 'G', 'SG': 'G', 'SF': 'F', 'PF': 'F', 'C': 'C'}
    _ADJACENT = {'PG': ['SG'], 'SG': ['PG', 'SF'], 'SF': ['SG', 'PF'], 'PF': ['SF', 'C'], 'C': ['PF']}

    def blend_bio_crossover(bref_pos, bio_pos_sorted):
        """bref_pos: a single specific column (e.g. 'SG'). bio_pos_sorted: the sort_pos'd
        NBA Stats bio string (e.g. 'G/F'). Returns bref_pos, with up to two adjacent
        crossover columns appended for every side bref_pos alone doesn't cover (D10,
        card_ratings_rebalance 2026-09-18: the single-crossover cap is gone — both of a
        column's ADJACENT sides can now be added, not just the first match — so a real
        three-way player (e.g. Scottie Barnes, bio 'G-F') gets a three-column depth-chart
        spread instead of being capped at two)."""
        if bref_pos not in _SIDE:
            return bref_pos
        own_side = _SIDE[bref_pos]
        bio_sides = {letter for letter in bio_pos_sorted.replace('-', '/').split('/') if letter in ('G', 'F', 'C')}
        extra_sides = bio_sides - {own_side}
        if not extra_sides:
            return bref_pos
        pos = bref_pos
        for candidate in _ADJACENT[bref_pos]:
            if _SIDE[candidate] in extra_sides:
                pos = sort_pos(f"{pos}/{candidate}")
        return pos

    # Pre-process Bio Data
    bio_map = {}
    for _, row in df_bio.iterrows():
        name = unidecode(row['PLAYER'])
        pos = sort_pos(str(row['POSITION']))

        height = str(row['HEIGHT'])
        weight = int(row['WEIGHT']) if pd.notna(row['WEIGHT']) else 0
        bio_map[name] = {"pos": pos, "height": height, "weight": weight}

    # D10 (card_ratings_rebalance, 2026-09-18): basketball-reference's 26 letter-index
    # pages (/players/a/ .. /players/z/, scraped by download_bref.js into
    # bref_positions/players_<letter>.html) carry the same G/F/C-only position
    # granularity as the NBA Stats bio.csv crossover source blend_bio_crossover already
    # used — this season's data does not support a true 3-way PG/SG/SF-style combo from
    # either source (verified: bref's own per-season Pos column never carries a combo,
    # and every bio/index Pos value is one or two of G/F/C). What the bref index DOES
    # improve is match accuracy: it's bref-native, so it lines up with the Player column
    # in per_game/advanced/shooting exactly instead of the fuzzy cross-source name match
    # bio.csv needs (a real source of mismatches - e.g. suffix/accent drift). Preferred
    # over bio.csv's crossover when present; bio.csv remains the fallback (and the only
    # source for height/weight, which the index pages don't carry).
    bref_pos_index = {}
    try:
        import glob
        for path in sorted(glob.glob('bref_positions/players_*.html')):
            with open(path, 'r', encoding='utf-8') as f:
                idx_html = f.read()
            idx_dfs = pd.read_html(io.StringIO(idx_html))
            for idx_df in idx_dfs:
                if 'Player' in idx_df.columns and 'Pos' in idx_df.columns and 'To' in idx_df.columns:
                    active = idx_df[idx_df['To'].astype(str) == '2026']
                    for _, irow in active.iterrows():
                        iname = unidecode(str(irow['Player']).replace('*', ''))
                        ipos = str(irow['Pos']).strip()
                        if ipos and ipos.lower() != 'nan':
                            bref_pos_index[iname] = sort_pos(ipos)
                    break
        print(f"Loaded bref position index: {len(bref_pos_index)} active players")
    except Exception as e:
        print(f"Could not load bref_positions index (falling back to bio.csv only): {e}")
    
    # card_balance T2 finding (2026-09-16): this block used to reassign all_nba_players
    # and all_defensive_players to a hardcoded snapshot right here, silently discarding
    # whatever the awards.html scrape above just found. It happened to match this
    # season's real scrape (verified), but would have frozen every future season's
    # All-NBA/All-Defensive teams to 2025-26's forever. Removed — the scraped dicts from
    # above are used as-is. major_awards has no scrape source (MVP/ROTY/DPOY/MIP aren't
    # decided mid-season on bref's awards page) and needs manual upkeep each season.
    major_awards = {
        'Shai Gilgeous-Alexander': ['MVP'],
        'Cooper Flagg': ['ROTY'],
        'Victor Wembanyama': ['DPOY'],
        'Nickeil Alexander-Walker': ['MIP']
    }

    # card_balance T2, owner hand-roll (2026-09-16): bref/bio give Jokic a plain 'C' this
    # season (no crossover - see T1's blend_bio_crossover), but his real-world reputation
    # as a "point-center" means he should be slottable at PF without a depth-chart
    # penalty. A manual override, not stats-driven - same pattern as major_awards/
    # LEGENDARY_PLAYERS. Keyed by the unidecode'd ASCII name used everywhere else.
    POSITION_OVERRIDES = {
        'Nikola Jokic': 'PF/C',
    }

    import sqlite3
    db_path = "../frontend/game.db"
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Create Tables
    c.executescript("""
    DROP TABLE IF EXISTS Player;
    DROP TABLE IF EXISTS SeasonStat;
    DROP TABLE IF EXISTS Award;
    
    CREATE TABLE Player (
        id TEXT PRIMARY KEY,
        name TEXT,
        position TEXT,
        height TEXT,
        weight INTEGER,
        age INTEGER,
        team TEXT
    );
    
    CREATE TABLE SeasonStat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT,
        season TEXT,
        gp INTEGER,
        gs INTEGER,
        mpg REAL,
        pts REAL,
        trb REAL,
        ast REAL,
        stl REAL,
        blk REAL,
        fga REAL,
        fg3a REAL,
        fg2a REAL,
        fg_pct REAL,
        fg3_pct REAL,
        fg2_pct REAL,
        ft_pct REAL,
        per REAL,
        ts REAL,
        vorp REAL,
        dbpm REAL,
        tov REAL,
        pct_fga_0_3 REAL,
        pct_fga_3_10 REAL,
        pct_fga_10_16 REAL,
        pct_fga_16_3p REAL,
        pct_fga_3p REAL,
        fg_pct_0_3 REAL,
        fg_pct_3_10 REAL,
        fg_pct_10_16 REAL,
        fg_pct_16_3p REAL,
        fg_pct_3p REAL,
        usg_pct REAL,
        ast_pct REAL,
        tov_pct REAL,
        stl_pct REAL,
        blk_pct REAL,
        orb_pct REAL,
        drb_pct REAL,
        trb_pct REAL,
        obpm REAL,
        dws REAL,
        ws_per_48 REAL,
        pct_ast_fg2 REAL,
        pct_ast_fg3 REAL,
        FOREIGN KEY(playerId) REFERENCES Player(id)
    );
    
    CREATE TABLE Award (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT,
        season TEXT,
        name TEXT,
        level INTEGER,
        FOREIGN KEY(playerId) REFERENCES Player(id)
    );
    """)
    
    import hashlib
    
    # Map real NBA IDs
    nba_index = {'active': {}, 'inactive': {}}
    try:
        from nba_api.stats.static import players
        nba_index = build_nba_index(players.get_players())
    except Exception as e:
        print("Could not map NBA IDs:", e)

    import hashlib
    import difflib

    players_json = []

    for _, row in df_filtered.iterrows():
        raw_name = row['Player'].replace('*', '')
        name = unidecode(raw_name)
        
        # Fuzzy match for bio
        bio_name = name
        if bio_name not in bio_map:
            matches = difflib.get_close_matches(bio_name, bio_map.keys(), n=1, cutoff=0.7)
            if matches:
                bio_name = matches[0]
                
        bio = bio_map.get(bio_name, {"pos": "", "height": "0-0", "weight": 0})
        # D1 (card_balance): basketball-reference Pos is the primary position source
        # (real PG/SG/SF/PF/C, occasionally a combo like "SG-PG"); the crossover source is
        # a broad G/F/C signal blended in as adjacent depth-chart columns (see
        # blend_bio_crossover above). D10 (card_ratings_rebalance, 2026-09-18): the bref
        # letter-index (exact name match) is preferred over bio.csv's fuzzy-matched
        # POSITION when both exist, falling back to bio.csv otherwise.
        crossover_pos = bref_pos_index.get(name) or bio["pos"]
        bref_pos = str(row['Pos']).strip() if pd.notna(row['Pos']) else ""
        if bref_pos:
            pos = sort_pos(bref_pos)
            if crossover_pos:
                pos = blend_bio_crossover(pos, crossover_pos)
        else:
            pos = crossover_pos
        pos = POSITION_OVERRIDES.get(name, pos)
        height = bio["height"]
        weight = bio["weight"]
        team = latest_teams.get(raw_name, row['Team'])
        age = int(row['Age'])
        
        real_id = resolve_nba_id(name, nba_index) or hashlib.md5((name + team + pos).encode('utf-8')).hexdigest()[:8]
        
        # Insert Player
        c.execute("INSERT INTO Player (id, name, position, height, weight, age, team) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  (real_id, raw_name, pos, height, weight, age, team))
                  
        # Insert SeasonStat
        c.execute("""
            INSERT INTO SeasonStat (
                playerId, season, gp, gs, mpg, pts, trb, ast, stl, blk, fga, fg3a, fg2a, fg_pct, fg3_pct, fg2_pct, ft_pct, per, ts, vorp, dbpm, tov,
                pct_fga_0_3, pct_fga_3_10, pct_fga_10_16, pct_fga_16_3p, pct_fga_3p,
                fg_pct_0_3, fg_pct_3_10, fg_pct_10_16, fg_pct_16_3p, fg_pct_3p,
                usg_pct, ast_pct, tov_pct, stl_pct, blk_pct, orb_pct, drb_pct, trb_pct, obpm, dws, ws_per_48,
                pct_ast_fg2, pct_ast_fg3
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            real_id, "2025-26", int(row['G']), int(row.get('GS', 0)), float(row['MP']), round(row['PTS'], 1), round(row['TRB'], 1),
            round(row['AST'], 1), round(row['STL'], 1), round(row['BLK'], 1), float(row.get('FGA', 0)),
            float(row.get('3PA', 0)), float(row.get('2PA', 0)), round(row['FG%'], 3), round(row['3P%'], 3),
            round(float(row.get('2P%', 0)), 3), round(float(row.get('FT%', 0)), 3), round(row['PER'], 1),
            round(row['TS%'], 3), round(row['VORP'], 1), round(row['DBPM'], 1), round(row['TOV'], 1),
            float(row.get('% of FGA by Distance_0-3', 0)), float(row.get('% of FGA by Distance_3-10', 0)), float(row.get('% of FGA by Distance_10-16', 0)), float(row.get('% of FGA by Distance_16-3P', 0)), float(row.get('% of FGA by Distance_3P', 0)),
            float(row.get('FG% by Distance_0-3', 0)), float(row.get('FG% by Distance_3-10', 0)), float(row.get('FG% by Distance_10-16', 0)), float(row.get('FG% by Distance_16-3P', 0)), float(row.get('FG% by Distance_3P', 0)),
            round(float(row.get('USG%', 0)) / 100.0, 4), round(float(row.get('AST%', 0)) / 100.0, 4),
            round(float(row.get('TOV%', 0)) / 100.0, 4), round(float(row.get('STL%', 0)) / 100.0, 4),
            round(float(row.get('BLK%', 0)) / 100.0, 4), round(float(row.get('ORB%', 0)) / 100.0, 4),
            round(float(row.get('DRB%', 0)) / 100.0, 4), round(float(row.get('TRB%', 0)) / 100.0, 4),
            round(float(row.get('OBPM', 0)), 2), round(float(row.get('DWS', 0)), 2), round(float(row.get('WS/48', 0)), 4),
            round(float(row.get("% of FG Ast'd_2P", 0)), 4), round(float(row.get("% of FG Ast'd_3P", 0)), 4)
        ))
        
        # Insert Awards
        if name in all_nba_players:
            c.execute("INSERT INTO Award (playerId, season, name, level) VALUES (?, ?, ?, ?)", 
                      (real_id, "2025-26", "All-NBA", all_nba_players[name]))
        if name in all_defensive_players:
            c.execute("INSERT INTO Award (playerId, season, name, level) VALUES (?, ?, ?, ?)", 
                      (real_id, "2025-26", "All-Defensive", all_defensive_players[name]))
        if name in major_awards:
            for aw in major_awards[name]:
                c.execute("INSERT INTO Award (playerId, season, name, level) VALUES (?, ?, ?, NULL)", 
                          (real_id, "2025-26", aw))
                          
        # We append to players_json just so download_images.py still works
        players_json.append({"id": real_id, "name": raw_name, "rarity": "Common"})

    conn.commit()
    conn.close()
    
    # Save the minimal json just for the image downloader script
    with open('players.json', 'w', encoding='utf-8') as f:
        json.dump(players_json, f, indent=2, ensure_ascii=False)
        
    print("Database created at frontend/game.db")
    print(f"Successfully generated {len(players_json)} players in players.json")

if __name__ == "__main__":
    fetch_and_generate_players()
