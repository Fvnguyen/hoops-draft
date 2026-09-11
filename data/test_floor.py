import json

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

for c in cards:
    r = c['ratings']
    base_ovr = r.get('_baseOvr', 40)
    
    # Mathematical transformation from Raw Index (0-99) to Floor Index (40-99)
    new_base_ovr = 40 + (base_ovr * (59.0 / 99.0))
    mult = r.get('_multiplier', 1.0)
    
    final_ovr = min(99, max(40, round(new_base_ovr * mult)))
    
    if final_ovr >= 90: rarity = 'Mythic'
    elif final_ovr >= 80: rarity = 'Rare'
    elif final_ovr >= 65: rarity = 'Uncommon'
    else: rarity = 'Common'
    
    has_mvp = any(a['name'] == 'MVP' for a in c['awards'])
    has_allnba1 = any(a['name'] == 'All-NBA' and a['level'] == 1 for a in c['awards'])
    has_allnba = any(a['name'] == 'All-NBA' for a in c['awards'])
    has_dpoy = any(a['name'] == 'DPOY' for a in c['awards'])
    has_alldef = any(a['name'] == 'All-Defensive' for a in c['awards'])
    
    if (has_mvp or has_allnba1) and rarity != 'Mythic': rarity = 'Mythic'
    elif (has_allnba or has_dpoy) and rarity not in ['Mythic', 'Rare']: rarity = 'Rare'
    elif has_alldef and rarity == 'Common': rarity = 'Uncommon'
    
    c['new_ovr'] = final_ovr
    c['new_rarity'] = rarity

counts = {'Mythic': 0, 'Rare': 0, 'Uncommon': 0, 'Common': 0}
for c in cards: counts[c['new_rarity']] += 1

print("COUNTS:", counts)
mythics = [c['player']['name'] for c in cards if c['new_rarity'] == 'Mythic']
rares = [c['player']['name'] for c in cards if c['new_rarity'] == 'Rare']
print("MYTHICS:", mythics)
print("RARES:", rares[:20])
