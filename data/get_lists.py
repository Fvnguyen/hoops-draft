import json

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

res = []
res.append('MYTHICS:\n' + '\n'.join(sorted([f"- {c['player']['name']} ({c['ratings']['overall']})" for c in cards if c['rarity'] == 'Mythic'])))
res.append('RARES:\n' + '\n'.join(sorted([f"- {c['player']['name']} ({c['ratings']['overall']})" for c in cards if c['rarity'] == 'Rare'])))
res.append('UNCOMMONS:\n' + '\n'.join(sorted([f"- {c['player']['name']} ({c['ratings']['overall']})" for c in cards if c['rarity'] == 'Uncommon'])))

with open('rarity_lists.txt', 'w', encoding='utf-8') as out:
    out.write('\n\n'.join(res))
