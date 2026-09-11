import re

with open('fetch_players.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add reading shooting.html
shooting_code = """
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
    
    # Merge shooting stats
    df_shooting = df_shooting.drop_duplicates(subset=['Player'])
    df_filtered = pd.merge(df_filtered, df_shooting[['Player', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P']], on='Player', how='left')
"""
code = code.replace("    # Clean data (handled by numeric conversion below)", shooting_code + "\n    # Clean data (handled by numeric conversion below)")

# 2. Update SeasonStat CREATE TABLE
new_columns = """
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
        FOREIGN KEY(playerId) REFERENCES Player(id)"""
code = code.replace("""
        dbpm REAL,
        tov REAL,
        FOREIGN KEY(playerId) REFERENCES Player(id)""", new_columns)

# 3. Update SeasonStat INSERT statement
insert_sql = """
            INSERT INTO SeasonStat (
                playerId, season, gp, mpg, pts, trb, ast, stl, blk, fga, fg3a, fg2a, fg_pct, fg3_pct, fg2_pct, ft_pct, per, ts, vorp, dbpm, tov,
                pct_fga_0_3, pct_fga_3_10, pct_fga_10_16, pct_fga_16_3p, pct_fga_3p,
                fg_pct_0_3, fg_pct_3_10, fg_pct_10_16, fg_pct_16_3p, fg_pct_3p
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
code = re.sub(r'INSERT INTO SeasonStat \([\s\S]*?\) VALUES \([\s\S]*?\)', insert_sql.strip(), code)

# 4. Update the tuple values in execute
values_tuple = """round(row['TOV'], 1),
            float(row.get('% of FGA by Distance_0-3', 0)), float(row.get('% of FGA by Distance_3-10', 0)), float(row.get('% of FGA by Distance_10-16', 0)), float(row.get('% of FGA by Distance_16-3P', 0)), float(row.get('% of FGA by Distance_3P', 0)),
            float(row.get('FG% by Distance_0-3', 0)), float(row.get('FG% by Distance_3-10', 0)), float(row.get('FG% by Distance_10-16', 0)), float(row.get('FG% by Distance_16-3P', 0)), float(row.get('FG% by Distance_3P', 0))
        ))"""
code = code.replace("""round(row['TOV'], 1)
        ))""", values_tuple)

with open('fetch_players.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("Updated fetch_players.py successfully")
