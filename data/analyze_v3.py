import json
import statistics
from collections import Counter, defaultdict

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

print("=== BADGE LEVELS PER RARITY ===")
badge_levels = {'Mythic': [], 'Rare': [], 'Uncommon': [], 'Common': []}
for c in cards:
    total_levels = sum(t['level'] for t in c['traits'])
    badge_levels[c['rarity']].append(total_levels)

for r in ['Mythic', 'Rare', 'Uncommon', 'Common']:
    arr = badge_levels[r]
    if arr:
        print(f"{r}: Avg Levels={round(statistics.mean(arr),1)}, Max={max(arr)}, Min={min(arr)}")

# 4. Distribution below 70 in chunks of 10
buckets = {'90+': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '40-49': 0, '<40': 0}
for c in cards:
    ovr = c['ratings']['overall']
    if ovr >= 90: buckets['90+'] += 1
    elif ovr >= 80: buckets['80-89'] += 1
    elif ovr >= 70: buckets['70-79'] += 1
    elif ovr >= 60: buckets['60-69'] += 1
    elif ovr >= 50: buckets['50-59'] += 1
    elif ovr >= 40: buckets['40-49'] += 1
    else: buckets['<40'] += 1

print("\n=== FULL OVR DISTRIBUTION (Chunks of 10) ===")
for k, v in buckets.items():
    print(f"{k}: {v}")
    
cards.sort(key=lambda x: x['ratings']['overall'], reverse=True)
print("\n=== TOP 10 PLAYERS ===")
for c in cards[:10]:
    try:
        badges_str = ', '.join([f"{t['name']} {t['level']}" for t in c['traits']])
        print(f"- {c['player']['name']}: {c['ratings']['overall']} OVR [{c['rarity']}] | Badges: {badges_str}")
    except:
        pass
