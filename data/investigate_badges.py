import json

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# 1. Defensive Bumps Investigation
bumped_defense = []
for c in cards:
    awards = c.get('awards', [])
    has_def_bump = False
    for a in awards:
        if 'All-Defensive' in a:
            has_def_bump = True
    
    if has_def_bump:
        db = c['_debug']
        pre_per = db['preBumpPerim']
        pre_post = db['preBumpPost']
        post_per = c['ratings']['perimeterDefense']
        post_post = c['ratings']['postDefense']
        
        max_pre = max(pre_per, pre_post)
        max_post = max(post_per, post_post)
        if max_pre < max_post:
            bumped_defense.append(f"{c['player']['name']} (OVR {c['ratings']['overall']}): Max Def was {max_pre} -> bumped to {max_post} (Award: {', '.join([a for a in awards if 'All-Defensive' in a])})")

# 2. Proposed Special Skills Simulation
skills = {
    "Ironman (GP >= 80, MPG >= 35)": lambda c: c['stats']['gp'] >= 80 and c['stats']['mpg'] >= 35,
    "Efficiency Savant (TS% >= 0.65, FGA >= 10)": lambda c: c['stats']['ts'] >= 0.65 and c['stats']['fga'] >= 10,
    "Floor General (AST >= 6.0, AST/TOV >= 3.0)": lambda c: c['stats']['ast'] >= 6.0 and (c['stats']['ast'] / max(0.1, c['stats']['tov'])) >= 3.0,
    "Young Phenom (Age <= 21, OVR >= 80)": lambda c: c['player']['age'] <= 21 and c['ratings']['overall'] >= 80,
    "Veteran Presence (Age >= 33, VORP >= 2.0)": lambda c: c['player']['age'] >= 33 and c['stats']['vorp'] >= 2.0,
    "Microwave (MPG <= 25, PTS >= 15)": lambda c: c['stats']['mpg'] <= 25 and c['stats']['pts'] >= 15,
    "Two-Way Disruptor (STL >= 1.5, BLK >= 1.0)": lambda c: c['stats']['stl'] >= 1.5 and c['stats']['blk'] >= 1.0,
    "Sniper (3P% >= 40%, 3PA >= 6.0)": lambda c: c['stats']['fg3_pct'] >= 0.40 and c['stats']['fg3a'] >= 6.0,
    "Volume Scorer (FGA >= 20, PTS >= 25)": lambda c: c['stats']['fga'] >= 20 and c['stats']['pts'] >= 25,
    "Stat Sheet Stuffer (PTS>=15, TRB>=7, AST>=5)": lambda c: c['stats']['pts'] >= 15 and c['stats']['trb'] >= 7 and c['stats']['ast'] >= 5
}

# 3. Badge Stripping / Forcing Investigation
stripped_commons = []
stripped_uncommons = []
forced_mythics = []

for c in cards:
    pre = c['_debug']['preClipBadges']
    post = c['traits']
    
    pre_lvl_sum = sum(t['level'] for t in pre)
    post_lvl_sum = sum(t['level'] for t in post)
    
    if c['rarity'] == 'Common' and pre_lvl_sum > post_lvl_sum:
        stripped_commons.append(f"{c['player']['name']} (OVR {c['ratings']['overall']}): Had {pre_lvl_sum} badge levels -> stripped to {post_lvl_sum}")
        
    if c['rarity'] == 'Uncommon' and pre_lvl_sum > post_lvl_sum:
        stripped_uncommons.append(f"{c['player']['name']} (OVR {c['ratings']['overall']}): Had {pre_lvl_sum} badge levels -> stripped to {post_lvl_sum}")
        
    if c['rarity'] == 'Mythic':
        has_natural_lvl3 = any(t['level'] == 3 for t in pre)
        if not has_natural_lvl3:
            forced_mythics.append(f"{c['player']['name']} (OVR {c['ratings']['overall']}): Had 0 Lvl 3 badges -> forced highest to Lvl 3")

with open('badge_investigation_out.txt', 'w', encoding='utf-8') as out:
    out.write("=== 1. ALL-DEFENSIVE BUMPS ===\n")
    out.write(f"Total players bumped: {len(bumped_defense)}\n")
    for b in bumped_defense:
        out.write("- " + b + "\n")

    out.write("\n=== 2. SPECIAL SKILLS PROPOSAL ===\n")
    for name, fn in skills.items():
        matched = [c['player']['name'] for c in cards if fn(c)]
        out.write(f"{name}: {len(matched)} players -> {', '.join(matched[:5])}{'...' if len(matched) > 5 else ''}\n")

    out.write("\n=== 3. BADGE RARITY CURVE ENFORCEMENT ===\n")
    out.write(f"Commons stripped of extra badges: {len(stripped_commons)}\n")
    for p in stripped_commons[:5]: out.write("- " + p + "\n")
    if len(stripped_commons) > 5: out.write(f"... and {len(stripped_commons)-5} more\n")

    out.write(f"\nUncommons stripped of extra/Lvl 3 badges: {len(stripped_uncommons)}\n")
    for p in stripped_uncommons[:5]: out.write("- " + p + "\n")
    if len(stripped_uncommons) > 5: out.write(f"... and {len(stripped_uncommons)-5} more\n")

    out.write(f"\nMythics forced to have a Lvl 3 badge: {len(forced_mythics)}\n")
    for p in forced_mythics: out.write("- " + p + "\n")
