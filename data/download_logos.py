import os
import requests
import time

team_ids = {
    'ATL': '1610612737', 'BOS': '1610612738', 'BKN': '1610612751', 'CHA': '1610612766', 'CHI': '1610612741',
    'CLE': '1610612739', 'DAL': '1610612742', 'DEN': '1610612743', 'DET': '1610612765', 'GSW': '1610612744',
    'HOU': '1610612745', 'IND': '1610612754', 'LAC': '1610612746', 'LAL': '1610612747', 'MEM': '1610612763',
    'MIA': '1610612748', 'MIL': '1610612749', 'MIN': '1610612750', 'NOP': '1610612740', 'NYK': '1610612752',
    'OKC': '1610612760', 'ORL': '1610612753', 'PHI': '1610612755', 'PHX': '1610612756', 'POR': '1610612757',
    'SAC': '1610612758', 'SAS': '1610612759', 'TOR': '1610612761', 'UTA': '1610612762', 'WAS': '1610612764'
}

def download_logos():
    os.makedirs('../frontend/public/logos', exist_ok=True)
    
    print(f"Downloading {len(team_ids)} team logos...")
    for team, tid in team_ids.items():
        path = f"../frontend/public/logos/{tid}.svg"
        if os.path.exists(path):
            print(f"Skipping {team} (already exists)")
            continue
            
        url = f"https://cdn.nba.com/logos/nba/{tid}/primary/L/logo.svg"
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                with open(path, 'wb') as f:
                    f.write(r.content)
                print(f"Downloaded {team}")
            else:
                print(f"Failed {team} - Status {r.status_code}")
        except Exception as e:
            print(f"Error {team} - {e}")
            
        time.sleep(0.1) # Small sleep to avoid CDN block
        
    print("\nLogo download complete!")

if __name__ == "__main__":
    download_logos()
