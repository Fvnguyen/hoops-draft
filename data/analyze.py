import json
from collections import Counter
import statistics

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# Sort by OVR
cards.sort(key=lambda x: x['ratings']['overall'], reverse=True)

# 1. Rarity Distribution
rarity_counts = Counter(c['rarity'] for c in cards)

# 2. Rating Distribution (Buckets)
buckets = {'95+': 0, '90-94': 0, '85-89': 0, '80-84': 0, '75-79': 0, '70-74': 0, '<70': 0}
for c in cards:
    ovr = c['ratings']['overall']
    if ovr >= 95: buckets['95+'] += 1
    elif ovr >= 90: buckets['90-94'] += 1
    elif ovr >= 85: buckets['85-89'] += 1
    elif ovr >= 80: buckets['80-84'] += 1
    elif ovr >= 75: buckets['75-79'] += 1
    elif ovr >= 70: buckets['70-74'] += 1
    else: buckets['<70'] += 1

# 3. Position Averages
pos_ovr = {}
for c in cards:
    pos = c['player']['position']
    if pos not in pos_ovr:
        pos_ovr[pos] = []
    pos_ovr[pos].append(c['ratings']['overall'])
pos_avg = {k: statistics.mean(v) for k, v in pos_ovr.items()}

# 4. Badge Frequencies
all_badges = []
for c in cards:
    for t in c['traits']:
        all_badges.append(f"{t['name']} ({t['level']})")
badge_counts = Counter(all_badges)

# 5. Top 15 Players (Eye Test)
top_15 = []
for c in cards[:15]:
    top_15.append(f"{c['player']['name']} ({c['player']['position']}) - {c['ratings']['overall']} OVR [{c['rarity']}]")

# 6. Bottom 5 Players (Eye Test)
bottom_5 = []
for c in cards[-5:]:
    bottom_5.append(f"{c['player']['name']} ({c['player']['position']}) - {c['ratings']['overall']} OVR [{c['rarity']}]")

# 7. Highest Rated Common / Lowest Rated Mythic/Rare
commons = [c for c in cards if c['rarity'] == 'Common']
uncommons = [c for c in cards if c['rarity'] == 'Uncommon']
rares = [c for c in cards if c['rarity'] == 'Rare']
mythics = [c for c in cards if c['rarity'] == 'Mythic']

highest_common = commons[0] if commons else None
lowest_mythic = mythics[-1] if mythics else None
lowest_rare = rares[-1] if rares else None

# 8. Dump to a text file for the agent context
with open('analytics_out.txt', 'w', encoding='utf-8') as f:
    f.write("RARITY:\n" + str(rarity_counts) + "\n\n")
    f.write("BUCKETS:\n" + str(buckets) + "\n\n")
    f.write("POS_AVG:\n" + str({k: round(v, 1) for k, v in sorted(pos_avg.items(), key=lambda item: item[1], reverse=True)}) + "\n\n")
    f.write("BADGES:\n" + str(badge_counts.most_common(20)) + "\n\n")
    f.write("TOP 15:\n" + '\n'.join(top_15) + "\n\n")
    f.write("BOTTOM 5:\n" + '\n'.join(bottom_5) + "\n\n")
    if highest_common: f.write(f"Highest Common: {highest_common['player']['name']} - {highest_common['ratings']['overall']} OVR\n")
    if lowest_rare: f.write(f"Lowest Rare: {lowest_rare['player']['name']} - {lowest_rare['ratings']['overall']} OVR\n")
    if lowest_mythic: f.write(f"Lowest Mythic: {lowest_mythic['player']['name']} - {lowest_mythic['ratings']['overall']} OVR\n")
