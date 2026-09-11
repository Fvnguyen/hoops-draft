import json
import os
import sys
import time
import requests
import pandas as pd
from bs4 import BeautifulSoup

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
    df = pd.merge(df_per_game, df_advanced[['Player', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP']], on='Player', how='inner')
    
    # Correctly merge shooting here!
    df_shooting = df_shooting.drop_duplicates(subset=['Player'])
    df = pd.merge(df, df_shooting[['Player', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P']], on='Player', how='left')

    
    # Convert numeric columns
    numeric_cols = ['Age', 'G', 'MP', 'PTS', 'TRB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FGA', '3PA', '3P', 'FG', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TOV', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P']
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
        
        # Scrape All-NBA
        div_all_nba = soup.find('div', id='div_all-nba')
        if div_all_nba:
            for div_team in div_all_nba.find_all('div', class_='data_grid_box'):
                team_level = 1 if '1' in div_team.get('id', '') else (2 if '2' in div_team.get('id', '') else 3)
                for a in div_team.find_all('a'):
                    if '/players/' in a.get('href', ''):
                        all_nba_players[a.text.strip()] = team_level
                    
        # Scrape All-Defensive
        div_all_def = soup.find('div', id='div_all-defensive')
        if div_all_def:
            for div_team in div_all_def.find_all('div', class_='data_grid_box'):
                team_level = 1 if '1' in div_team.get('id', '') else 2
                for a in div_team.find_all('a'):
                    if '/players/' in a.get('href', ''):
                        all_defensive_players[a.text.strip()] = team_level
                    
        # Scrape All-Star
        div_all_star = soup.find('div', id='div_all_star_game_rosters')
        if div_all_star:
            for a in div_all_star.find_all('a'):
                if '/players/' in a.get('href', ''):
                    all_star_players.add(a.text.strip())
                    
    except Exception as e:
        print(f"Could not read local awards html: {e}")

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
    from unidecode import unidecode
    
    # Pre-process Bio Data
    bio_map = {}
    for _, row in df_bio.iterrows():
        name = unidecode(row['PLAYER'])
        pos = str(row['POSITION']).replace('-', '/')
        
        # Deterministic sorting for positions
        def sort_pos(p_str):
            order = {'PG': 1, 'SG': 2, 'SF': 3, 'PF': 4, 'C': 5, 'G': 1, 'F': 3}
            parts = p_str.split('/')
            parts.sort(key=lambda x: order.get(x, 99))
            
            # Standardize G/F to SG/SF etc if we want, but B-Ref gives exact F-G which we sort to G/F
            return "/".join(parts)
            
        pos = sort_pos(pos)
        
        height = str(row['HEIGHT'])
        weight = int(row['WEIGHT']) if pd.notna(row['WEIGHT']) else 0
        bio_map[name] = {"pos": pos, "height": height, "weight": weight}
    
    all_nba_players = {
        'Cade Cunningham': 1, 'Luka Doncic': 1, 'Shai Gilgeous-Alexander': 1, 'Nikola Jokic': 1, 'Victor Wembanyama': 1,
        'Jaylen Brown': 2, 'Kawhi Leonard': 2, 'Donovan Mitchell': 2, 'Kevin Durant': 2, 'Jalen Brunson': 2,
        'Tyrese Maxey': 3, 'Jamal Murray': 3, 'Jalen Johnson': 3, 'Jalen Duren': 3, 'Chet Holmgren': 3
    }
    
    all_defensive_players = {
        'Victor Wembanyama': 1, 'Rudy Gobert': 1, 'Chet Holmgren': 1, 'Derrick White': 1, 'Ausar Thompson': 1,
        'Scottie Barnes': 2, 'Cason Wallace': 2, 'Bam Adebayo': 2, 'OG Anunoby': 2, 'Dyson Daniels': 2
    }
    
    major_awards = {
        'Shai Gilgeous-Alexander': ['MVP'],
        'Cooper Flagg': ['ROTY'],
        'Victor Wembanyama': ['DPOY'],
        'Nickeil Alexander-Walker': ['MIP']
    }

    all_star_players = set()
    
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
    nba_dict = {}
    nba_keys = []
    try:
        from nba_api.stats.static import players
        nba_players = players.get_players()
        nba_dict = {unidecode(p['full_name']).lower(): str(p['id']) for p in nba_players}
        nba_keys = list(nba_dict.keys())
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
                
        bio = bio_map.get(bio_name, {"pos": str(row['Pos']), "height": "0-0", "weight": 0})
        pos = bio["pos"]
        height = bio["height"]
        weight = bio["weight"]
        team = latest_teams.get(raw_name, row['Team'])
        age = int(row['Age'])
        
        name_lower = name.lower()
        if name_lower not in nba_dict:
            # Fuzzy match for NBA API
            nba_matches = difflib.get_close_matches(name_lower, nba_keys, n=1, cutoff=0.7)
            if nba_matches:
                name_lower = nba_matches[0]

        real_id = nba_dict.get(name_lower) or hashlib.md5((name + team + pos).encode('utf-8')).hexdigest()[:8]
        
        # Insert Player
        c.execute("INSERT INTO Player (id, name, position, height, weight, age, team) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  (real_id, raw_name, pos, height, weight, age, team))
                  
        # Insert SeasonStat
        c.execute("""
            INSERT INTO SeasonStat (
                playerId, season, gp, mpg, pts, trb, ast, stl, blk, fga, fg3a, fg2a, fg_pct, fg3_pct, fg2_pct, ft_pct, per, ts, vorp, dbpm, tov,
                pct_fga_0_3, pct_fga_3_10, pct_fga_10_16, pct_fga_16_3p, pct_fga_3p,
                fg_pct_0_3, fg_pct_3_10, fg_pct_10_16, fg_pct_16_3p, fg_pct_3p
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            real_id, "2025-26", int(row['G']), float(row['MP']), round(row['PTS'], 1), round(row['TRB'], 1), 
            round(row['AST'], 1), round(row['STL'], 1), round(row['BLK'], 1), float(row.get('FGA', 0)), 
            float(row.get('3PA', 0)), float(row.get('2PA', 0)), round(row['FG%'], 3), round(row['3P%'], 3), 
            round(float(row.get('2P%', 0)), 3), round(float(row.get('FT%', 0)), 3), round(row['PER'], 1), 
            round(row['TS%'], 3), round(row['VORP'], 1), round(row['DBPM'], 1), round(row['TOV'], 1),
            float(row.get('% of FGA by Distance_0-3', 0)), float(row.get('% of FGA by Distance_3-10', 0)), float(row.get('% of FGA by Distance_10-16', 0)), float(row.get('% of FGA by Distance_16-3P', 0)), float(row.get('% of FGA by Distance_3P', 0)),
            float(row.get('FG% by Distance_0-3', 0)), float(row.get('FG% by Distance_3-10', 0)), float(row.get('FG% by Distance_10-16', 0)), float(row.get('FG% by Distance_16-3P', 0)), float(row.get('FG% by Distance_3P', 0))
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
