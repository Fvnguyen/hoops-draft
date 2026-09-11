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
    
    # Convert numeric columns
    numeric_cols = ['Age', 'G', 'MP', 'PTS', 'TRB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FGA', '3PA', '3P', 'FG', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TOV', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP']
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
    
    players_json = []
    import hashlib
    
    for _, row in df_filtered.iterrows():
        name = row['Player'].replace('*', '')
        pos = str(row['Pos'])
        team = latest_teams.get(row['Player'], row['Team'])
        
        combo_pct = row['Combo_Rank']
        rarity = "Common"
        if combo_pct >= 0.95: rarity = "Mythic"
        elif combo_pct >= 0.85: rarity = "Rare"
        elif combo_pct >= 0.60: rarity = "Uncommon"
        
        awards = []
        is_all_nba = name in all_nba_players
        is_all_def = name in all_defensive_players
        is_all_star = name in all_star_players
        if not all_star_players and combo_pct >= 0.92: is_all_star = True
        
        if is_all_nba:
            awards.append("All-NBA")
            if rarity in ["Common", "Uncommon"]: rarity = "Rare"
        if is_all_def:
            awards.append("All-Defensive")
            if rarity == "Common": rarity = "Uncommon"
        if is_all_star:
            awards.append("All-Star")
            if rarity == "Common": rarity = "Uncommon"
            
        # Game Ratings
        shooting = int(row['Shooting'])
        inside = int(row['Inside'])
        playmaking = int(row['Playmaking'])
        rebounding = int(row['Rebounding'])
        perim_def = int(row['PerimDef'])
        post_def = int(row['PostDef'])
        vorp = row['VORP']
        bpm = row['BPM']
        
        # Awards Overrides
        if is_all_def:
            def_team = all_defensive_players[name]
            floor = 90 if def_team == 1 else 80
            if perim_def >= post_def: perim_def = max(perim_def, floor)
            else: post_def = max(post_def, floor)
            
        off_max = max(shooting, inside)
        off_min = min(shooting, inside)
        def_max = max(perim_def, post_def)
        
        # OVR Formula: Moderate impact from VORP/BPM to prevent artificial 99s
        overall = off_max*0.4 + playmaking*0.2 + def_max*0.2 + rebounding*0.1 + off_min*0.1 + (vorp * 0.5) + (bpm * 0.5)
        overall = int(round(max(40, min(99, overall))))
        
        if is_all_nba:
            nba_team = all_nba_players[name]
            if nba_team == 1: overall = max(overall, 94)
            elif nba_team == 2: overall = max(overall, 89)
            elif nba_team == 3: overall = max(overall, 84)
            
        # Rarity Gating / Upgrades
        has_awards = len(awards) > 0
        
        if rarity in ["Mythic", "Rare"]:
            # Downgrade if no awards and not elite production
            if not has_awards and not (overall >= 80 and row['MP'] >= 30.0):
                rarity = "Uncommon"
        else:
            # Upgrade (like Siakam) if they have elite OVR and minutes despite no awards/efficiency
            if overall >= 85 and row['MP'] >= 33.0:
                rarity = "Rare"
            
        # Assign Badges
        traits = []
        def get_badge_tier(val, badge_name):
            if val >= 96: return f"3x {badge_name}"
            if val >= 90: return f"2x {badge_name}"
            if val >= 80: return f"1x {badge_name}"
            return None
            
        b = get_badge_tier(shooting, "Sharpshooter"); 
        if b: traits.append(b)
        b = get_badge_tier(inside, "Finisher"); 
        if b: traits.append(b)
        b = get_badge_tier(playmaking, "Floor General"); 
        if b: traits.append(b)
        b = get_badge_tier(rebounding, "Glass Cleaner"); 
        if b: traits.append(b)
        b = get_badge_tier(perim_def, "Lockdown Defender"); 
        if b: traits.append(b)
        b = get_badge_tier(post_def, "Paint Protector"); 
        if b: traits.append(b)
        
        # Hybrid Badges
        if (perim_def >= 85 or post_def >= 85) and (shooting >= 85 or inside >= 85):
            traits.append("Two-Way Star")
        if pos in ['SF', 'PF'] and playmaking >= 80:
            traits.append("Point Forward")
        if playmaking >= 85 and (shooting >= 85 or inside >= 85):
            traits.append("Offensive Engine")
        
        real_id = hashlib.md5((name + team + pos).encode('utf-8')).hexdigest()[:8]
        
        player_dict = {
            "id": real_id,
            "name": name,
            "position": pos,
            "team": team,
            "physicals": {
                "age": int(row['Age']),
                "height": "0-0",
                "weight": 0
            },
            "countingStats": {
                "ppg": round(row['PTS'], 1),
                "rpg": round(row['TRB'], 1),
                "apg": round(row['AST'], 1),
                "spg": round(row['STL'], 1),
                "bpg": round(row['BLK'], 1),
                "fg3p": round(row['3P%'], 3),
                "fga": round(float(row.get('FGA', 0)), 1),
                "fg3a": round(float(row.get('3PA', 0)), 1),
                "fg2a": round(float(row.get('2PA', 0)), 1),
                "fg2p": round(float(row.get('2P%', 0)), 3),
                "ftp": round(float(row.get('FT%', 0)), 3)
            },
            "advancedStats": {
                "fgp": round(row['FG%'], 3),
                "ts": round(row['TS%'], 3),
                "mpg": round(row['MP'], 1),
                "gp": int(row['G']),
                "per": round(row['PER'], 1),
                "vorp": round(row['VORP'], 1),
                "dbpm": round(row['DBPM'], 1)
            },
            "awards": awards,
            "gameRatings": {
                "overall": overall,
                "shooting": shooting,
                "inside": inside,
                "playmaking": playmaking,
                "rebounding": rebounding,
                "perimeterDefense": perim_def,
                "postDefense": post_def
            },
            "rarity": rarity,
            "traits": traits
        }
        players_json.append(player_dict)

    try:
        from nba_api.stats.static import players
        nba_players = players.get_players()
        nba_dict = {p['full_name'].lower(): p['id'] for p in nba_players}
        for p in players_json:
            name_lower = p['name'].lower()
            if name_lower in nba_dict:
                p['id'] = str(nba_dict[name_lower])
    except Exception as e:
        print("Could not map NBA IDs:", e)

    output_path = os.path.join(os.path.dirname(__file__), "players.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(players_json, f, indent=2)

    print(f"Successfully generated {len(players_json)} players in {output_path}")

if __name__ == "__main__":
    fetch_and_generate_players()
