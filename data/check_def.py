import json
with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)
targets = ['Rudy Gobert', 'Victor Wembanyama', 'Marcus Smart', 'Stephen Curry', 'Herbert Jones', 'Kevin Durant', 'Jalen Johnson']
print(f"| {'Player':<20} | {'PER DEF':<7} | {'POST DEF':<8} |")
print('|' + '-'*22 + '|' + '-'*9 + '|' + '-'*10 + '|')
for t in targets:
    for c in cards:
        if c['player']['name'] == t:
            print(f"| {t:<20} | {c['ratings']['perimeterDefense']:>7} | {c['ratings']['postDefense']:>8} |")
