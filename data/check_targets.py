import json
with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

targets = ['Stephen Curry', 'Kevin Durant', 'Jalen Johnson', 'James Harden', 'Cade Cunningham', 'Jalen Duren']
print(f"| {'Player':<20} | {'OVR':<3} | {'FIN':<3} | {'MID':<3} | {'PER':<3} |")
print('|' + '-'*22 + '|' + '-'*5 + '|' + '-'*5 + '|' + '-'*5 + '|' + '-'*5 + '|')
for t in targets:
    for c in cards:
        if c['player']['name'] == t:
            print(f"| {t:<20} | {c['ratings']['overall']:>3} | {c['ratings']['finishing']:>3} | {c['ratings']['midRange']:>3} | {c['ratings']['perimeter']:>3} |")

for c in cards:
    if 'Luka Don' in c['player']['name']:
        print(f"| {'Luka Doncic':<20} | {c['ratings']['overall']:>3} | {c['ratings']['finishing']:>3} | {c['ratings']['midRange']:>3} | {c['ratings']['perimeter']:>3} |")

