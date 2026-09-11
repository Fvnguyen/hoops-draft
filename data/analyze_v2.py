import json
import statistics
from collections import Counter, defaultdict

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# 1. OVR Stats per Rarity
rarity_ovr = defaultdict(list)
for c in cards:
    rarity_ovr[c['rarity']].append(c['ratings']['overall'])

print("=== OVR AVERAGES PER RARITY ===")
for r in ['Mythic', 'Rare', 'Uncommon', 'Common']:
    arr = rarity_ovr[r]
    if arr:
        print(f"{r}: Avg={round(statistics.mean(arr),1)}, Min={min(arr)}, Max={max(arr)}, Count={len(arr)}")

# 2. OVR Stats per Position
pos_ovr = defaultdict(list)
for c in cards:
    pos_ovr[c['player']['position']].append(c['ratings']['overall'])

print("\n=== OVR AVERAGES PER POSITION ===")
sorted_pos = sorted(pos_ovr.items(), key=lambda x: statistics.mean(x[1]), reverse=True)
for pos, arr in sorted_pos:
    print(f"{pos}: Avg={round(statistics.mean(arr),1)}, Min={min(arr)}, Max={max(arr)}, Count={len(arr)}")

# 3. Rarity Bumps
bumped_players = []
downgraded_players = []
for c in cards:
    if '_debug' in c and c['_debug']:
        if c['_debug'].get('upgradeReason'):
            bumped_players.append(c)
        if c['_debug'].get('downgradeReason'):
            downgraded_players.append(c)

print("\n=== PLAYERS WHO GOT A RARITY BUMP ===")
print(f"Total Bumped: {len(bumped_players)}")
for c in bumped_players:
    reason = c['_debug']['upgradeReason']
    raw = c['_debug']['rawRarity']
    final = c['rarity']
    print(f"- {c['player']['name']} ({c['player']['position']}): {raw} -> {final} (Reason: {reason}, OVR: {c['ratings']['overall']}, MPG: {c['stats']['mpg']})")

print("\n=== PLAYERS WHO GOT DOWNGRADED (Fluke Stats) ===")
for c in downgraded_players:
    print(f"- {c['player']['name']}: {c['_debug']['rawRarity']} -> {c['rarity']} (OVR: {c['ratings']['overall']}, MPG: {c['stats']['mpg']})")

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
print("\n=== TOP 15 PLAYERS ===")
for c in cards[:15]:
    try:
        print(f"- {c['player']['name']}: {c['ratings']['overall']} OVR [{c['rarity']}]")
    except:
        pass
