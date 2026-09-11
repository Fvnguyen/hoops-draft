import re

with open('fetch_players.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove the incorrectly placed merge
wrong_merge = """    # Merge shooting stats
    df_shooting = df_shooting.drop_duplicates(subset=['Player'])
    df = pd.merge(df, df_shooting[['Player', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P']], on='Player', how='left')"""
code = code.replace(wrong_merge, "")

# Find the correct merge spot and insert it
correct_merge = """    df = pd.merge(df_per_game, df_advanced[['Player', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP']], on='Player', how='inner')
    
    # Correctly merge shooting here!
    df_shooting = df_shooting.drop_duplicates(subset=['Player'])
    df = pd.merge(df, df_shooting[['Player', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P']], on='Player', how='left')
"""
code = code.replace("    df = pd.merge(df_per_game, df_advanced[['Player', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP']], on='Player', how='inner')", correct_merge)

# Make sure they are parsed as numeric
numeric_update = """numeric_cols = ['Age', 'G', 'MP', 'PTS', 'TRB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FGA', '3PA', '3P', 'FG', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TOV', 'PER', 'TS%', 'BPM', 'DBPM', 'VORP', '% of FGA by Distance_0-3', '% of FGA by Distance_3-10', '% of FGA by Distance_10-16', '% of FGA by Distance_16-3P', '% of FGA by Distance_3P', 'FG% by Distance_0-3', 'FG% by Distance_3-10', 'FG% by Distance_10-16', 'FG% by Distance_16-3P', 'FG% by Distance_3P']"""
code = re.sub(r"numeric_cols = \['Age'.*?'VORP'\]", numeric_update, code)

# Fix the print bug where I broke the c.execute in the previous attempt
code = code.replace("print(real_id, float(row.get('% of FGA by Distance_0-3', 0)))\n        c.execute(", "c.execute(")

with open('fetch_players.py', 'w', encoding='utf-8') as f:
    f.write(code)
