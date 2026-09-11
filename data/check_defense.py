import json

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# Get the benchmarks by recreating the logic
p_defs = []
i_defs = []
for c in cards:
    stat = c['stats']
    p_def_raw = (stat.get('stl', 0) * 20.0) + (stat.get('dbpm', 0) * 5.0)
    i_def_raw = (stat.get('blk', 0) * 15.0) + (stat.get('dbpm', 0) * 5.0)
    p_defs.append(p_def_raw)
    i_defs.append(i_def_raw)

def get_top5_avg(arr):
    sorted_arr = sorted(arr, reverse=True)
    top_cnt = max(1, int(len(arr) * 0.05))
    return sum(sorted_arr[:top_cnt]) / top_cnt

b_pdef = get_top5_avg(p_defs)
b_idef = get_top5_avg(i_defs)

targets = ['Stephen Curry', 'Kevin Durant', 'Jalen Johnson']

print(f"BENCHMARKS -> P-DEF: {b_pdef:.1f} | I-DEF: {b_idef:.1f}\n")

for c in cards:
    if c['player']['name'] in targets:
        s = c['stats']
        print(f"--- {c['player']['name']} ---")
        print(f"STL: {s.get('stl', 0)} | BLK: {s.get('blk', 0)} | DBPM: {s.get('dbpm', 0)}")
        p_raw = (s.get('stl', 0) * 20.0) + (s.get('dbpm', 0) * 5.0)
        i_raw = (s.get('blk', 0) * 15.0) + (s.get('dbpm', 0) * 5.0)
        print(f"P-DEF Raw: {p_raw:.1f} (Index: {min(1.0, p_raw/b_pdef)*100:.1f}%) -> Rating: {c['ratings']['perimeterDefense']}")
        print(f"I-DEF Raw: {i_raw:.1f} (Index: {min(1.0, i_raw/b_idef)*100:.1f}%) -> Rating: {c['ratings']['postDefense']}")
        print(f"Shot Dist: 0-3: {s.get('pct_fga_0_3',0)*100:.1f}% | Mid: {(s.get('pct_fga_3_10',0)+s.get('pct_fga_10_16',0))*100:.1f}% | Per: {(s.get('pct_fga_16_3p',0)+s.get('pct_fga_3p',0))*100:.1f}%")
        print()
