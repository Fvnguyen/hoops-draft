import json
import time
import pandas as pd
from nba_api.stats.static import teams
from nba_api.stats.endpoints import commonteamroster

# season_2026_27 D1: the game uses basketball-reference team abbreviations
# (`card.player.team`, engine/challenge.ts); the NBA Stats API uses its own for three teams.
NBA_TO_BREF = {'BKN': 'BRK', 'CHA': 'CHO', 'PHX': 'PHO'}


def fetch_bios():
    with open("season_config.json", encoding="utf-8") as f:
        season = json.load(f)["current"]
    print(f"Fetching {season} rosters (team, height, weight) for all 30 teams...")
    dfs = []

    for t in teams.get_teams():
        print(f"Fetching {t['full_name']}...")
        roster = commonteamroster.CommonTeamRoster(team_id=t['id'], season=season, timeout=60).get_data_frames()[0]
        roster['TEAM_ABBR'] = NBA_TO_BREF.get(t['abbreviation'], t['abbreviation'])
        dfs.append(roster)
        time.sleep(0.5)  # Avoid rate limit

    final_df = pd.concat(dfs, ignore_index=True)
    final_df.to_csv("bio.csv", index=False)
    print(f"Saved bio.csv: {len(final_df)} players on {final_df['TEAM_ABBR'].nunique()} teams")


if __name__ == "__main__":
    fetch_bios()
