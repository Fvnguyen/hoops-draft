import os
import json
import time
import requests

def download_images():
    with open('players.json', 'r', encoding='utf-8') as f:
        players = json.load(f)
        
    os.makedirs('../frontend/public/headshots', exist_ok=True)
    
    missing_critical = []
    
    print(f"Checking images for {len(players)} players...")
    for i, p in enumerate(players):
        pid = p['id']
        name = p['name']
        rarity = p.get('rarity', 'Common')
        
        path = f"../frontend/public/headshots/{pid}.png"
        if os.path.exists(path):
            continue
            
        url = f"https://cdn.nba.com/headshots/nba/latest/1040x760/{pid}.png"
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                with open(path, 'wb') as img_f:
                    img_f.write(r.content)
            else:
                if rarity in ['Mythic', 'Rare']:
                    missing_critical.append(f"{name} ({rarity}) - {r.status_code}")
                # Fallback to empty transparent pixel or placeholder
        except Exception as e:
            if rarity in ['Mythic', 'Rare']:
                missing_critical.append(f"{name} ({rarity}) - {e}")
                
        if i % 50 == 0:
            print(f"Processed {i}/{len(players)} images...")
            
        time.sleep(0.1) # Small sleep to avoid CDN block
        
    if missing_critical:
        print("\nWARNING: Missing headshots for high rarity players:")
        for m in missing_critical:
            print(m)
    else:
        print("\nAll Mythic and Rare players have headshots!")

if __name__ == "__main__":
    download_images()
