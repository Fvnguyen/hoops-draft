import json
from collections import defaultdict

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

pos_data = defaultdict(lambda: {'count': 0, 'ovr': 0, 'fin': 0, 'mid': 0, 'per': 0, 'ply': 0, 'reb': 0, 'pdef': 0, 'idef': 0})

for c in cards:
    pos = c['player']['position']
    rtg = c['ratings']
    pos_data[pos]['count'] += 1
    pos_data[pos]['ovr'] += rtg['overall']
    pos_data[pos]['fin'] += rtg['finishing']
    pos_data[pos]['mid'] += rtg['midRange']
    pos_data[pos]['per'] += rtg['perimeter']
    pos_data[pos]['ply'] += rtg['playmaking']
    pos_data[pos]['reb'] += rtg['rebounding']
    pos_data[pos]['pdef'] += rtg['perimeterDefense']
    pos_data[pos]['idef'] += rtg['postDefense']

print(f"| {'Position':<10} | {'Count':<5} | {'OVR':<4} | {'FIN':<4} | {'MID':<4} | {'PER':<4} | {'PLY':<4} | {'REB':<4} | {'P-DEF':<5} | {'I-DEF':<5} |")
print("|" + "-"*12 + "|" + "-"*7 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*6 + "|" + "-"*7 + "|" + "-"*7 + "|")

sorted_pos = sorted(pos_data.keys(), key=lambda x: pos_data[x]['count'], reverse=True)

for pos in sorted_pos:
    d = pos_data[pos]
    cnt = d['count']
    print(f"| {pos:<10} | {cnt:<5} | {d['ovr']/cnt:4.1f} | {d['fin']/cnt:4.1f} | {d['mid']/cnt:4.1f} | {d['per']/cnt:4.1f} | {d['ply']/cnt:4.1f} | {d['reb']/cnt:4.1f} | {d['pdef']/cnt:5.1f} | {d['idef']/cnt:5.1f} |")
