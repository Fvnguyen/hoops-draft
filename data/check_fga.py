import json

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

for c in cards:
    if c['player']['name'] in ['Stephen Curry', 'Kevin Durant', 'Jalen Johnson']:
        print(c['player']['name'])
        s = c['stats']
        print(f"FGA: {s.get('fga')} | 0-3%: {s.get('pct_fga_0_3')} | 0-3 FG%: {s.get('fg_pct_0_3')}")
