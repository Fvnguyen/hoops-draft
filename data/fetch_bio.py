import time
import pandas as pd
from nba_api.stats.static import teams
from nba_api.stats.endpoints import commonteamroster

def fetch_bios():
    print("Fetching bio data (height, weight, exact positions) for all 30 teams...")
    all_teams = teams.get_teams()
    dfs = []
    
    for i, t in enumerate(all_teams):
        team_id = t['id']
        print(f"Fetching {t['full_name']}...")
        roster = commonteamroster.CommonTeamRoster(team_id=team_id, season='2025-26').get_data_frames()[0]
        dfs.append(roster)
        time.sleep(0.5) # Avoid rate limit
        
    final_df = pd.concat(dfs, ignore_index=True)
    final_df.to_csv("bio.csv", index=False)
    print("Saved bio.csv with hard data!")

if __name__ == "__main__":
    fetch_bios()
