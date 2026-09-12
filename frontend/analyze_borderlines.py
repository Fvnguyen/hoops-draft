import json
import re

with open('data/computed_cards.json', encoding='utf-8') as f:
    cards = json.load(f)

# Current cutoffs
print("Current Cutoffs: Mythic=90, Rare=80, Uncommon=65")
print()

# Dillon Brooks
brooks = next((c for c in cards if 'brooks' in c['player']['name'].lower()), None)
if brooks:
    print('--- DILLON BROOKS ---')
    print('Player Info:', brooks['player'])
    print('Ratings:', brooks['ratings'])
    print()

# Top 5 by rarity
for r in ['Common', 'Uncommon', 'Rare']:
    r_cards = [c for c in cards if c['rarity'] == r]
    r_cards.sort(key=lambda x: x['ratings']['overall'], reverse=True)
    print(f'--- TOP 5 HIGHEST RATED {r.upper()} ---')
    for c in r_cards[:5]:
        print(f"{c['player']['name']} - OVR: {c['ratings']['overall']} (BaseRaw: {c['ratings']['_baseOvr']:.1f}, Mult: {c['ratings']['_multiplier']:.2f}, PER: {c['stats']['per']}, VORP: {c['stats']['vorp']}, DBPM: {c['stats']['dbpm']})")
    print()
