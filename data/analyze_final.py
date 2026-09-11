import json

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

rarities = ['Mythic', 'Rare', 'Uncommon', 'Common']
agg = {r: {'count': 0, 'ovr': 0, 'fin': 0, 'mid': 0, 'per': 0, 'ply': 0, 'reb': 0, 'pdef': 0, 'idef': 0} for r in rarities}

for c in cards:
    r = c['rarity']
    rtg = c['ratings']
    agg[r]['count'] += 1
    agg[r]['ovr'] += rtg['overall']
    agg[r]['fin'] += rtg['finishing']
    agg[r]['mid'] += rtg['midRange']
    agg[r]['per'] += rtg['perimeter']
    agg[r]['ply'] += rtg['playmaking']
    agg[r]['reb'] += rtg['rebounding']
    agg[r]['pdef'] += rtg['perimeterDefense']
    agg[r]['idef'] += rtg['postDefense']

print("### Rarity Distribution & Averages")
print(f"| {'Rarity':<10} | {'Count':<5} | {'OVR':<4} | {'FIN':<4} | {'MID':<4} | {'PER':<4} | {'PLY':<4} | {'REB':<4} | {'P-DEF':<5} | {'I-DEF':<5} |")
print("|" + "-"*12 + "|" + "-"*7 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*7 + "|" + "-"*7 + "|")

for r in rarities:
    cnt = agg[r]['count']
    if cnt == 0:
        print(f"| {r:<10} | {cnt:<5} | {'-':<4} | {'-':<4} | {'-':<4} | {'-':<4} | {'-':<4} | {'-':<4} | {'-':<5} | {'-':<5} |")
    else:
        print(f"| {r:<10} | {cnt:<5} | {agg[r]['ovr']/cnt:4.1f} | {agg[r]['fin']/cnt:4.1f} | {agg[r]['mid']/cnt:4.1f} | {agg[r]['per']/cnt:4.1f} | {agg[r]['ply']/cnt:4.1f} | {agg[r]['reb']/cnt:4.1f} | {agg[r]['pdef']/cnt:5.1f} | {agg[r]['idef']/cnt:5.1f} |")


print("\n### Sample Players Profile")
print(f"| {'Player':<20} | {'Rarity':<8} | {'OVR':<3} | {'FIN':<3} | {'MID':<3} | {'PER':<3} | {'PLY':<3} | {'REB':<3} | {'P-DEF':<5} | {'I-DEF':<5} |")
print("|" + "-"*22 + "|" + "-"*10 + "|" + "-"*5 + "|" + "-"*5 + "|" + "-"*5 + "|" + "-"*5 + "|" + "-"*5 + "|" + "-"*5 + "|" + "-"*7 + "|" + "-"*7 + "|")

targets = ['Kevin Durant', 'Stephen Curry', 'Cade Cunningham', 'Jalen Johnson', 'Jalen Duren', 'Pascal Siakam']
for t in targets:
    for c in cards:
        if c['player']['name'] == t:
            rtg = c['ratings']
            print(f"| {t:<20} | {c['rarity']:<8} | {rtg['overall']:>3} | {rtg['finishing']:>3} | {rtg['midRange']:>3} | {rtg['perimeter']:>3} | {rtg['playmaking']:>3} | {rtg['rebounding']:>3} | {rtg['perimeterDefense']:>5} | {rtg['postDefense']:>5} |")

# Handle fuzzy names
for c in cards:
    if 'Luka Don' in c['player']['name']:
        rtg = c['ratings']
        print(f"| {'Luka Doncic':<20} | {c['rarity']:<8} | {rtg['overall']:>3} | {rtg['finishing']:>3} | {rtg['midRange']:>3} | {rtg['perimeter']:>3} | {rtg['playmaking']:>3} | {rtg['rebounding']:>3} | {rtg['perimeterDefense']:>5} | {rtg['postDefense']:>5} |")
    if 'Pritchard' in c['player']['name']:
        rtg = c['ratings']
        print(f"| {'Payton Pritchard':<20} | {c['rarity']:<8} | {rtg['overall']:>3} | {rtg['finishing']:>3} | {rtg['midRange']:>3} | {rtg['perimeter']:>3} | {rtg['playmaking']:>3} | {rtg['rebounding']:>3} | {rtg['perimeterDefense']:>5} | {rtg['postDefense']:>5} |")
