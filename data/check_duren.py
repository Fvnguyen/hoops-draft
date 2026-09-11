import json
with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)
for c in cards:
    if c['player']['name'] == 'Jalen Duren':
        s = c['stats']
        print(f"FGA: {s.get('fga')}")
        print(f"16-3P %FGA: {s.get('pct_fga_16_3p')} | FG%: {s.get('fg_pct_16_3p')}")
        print(f"3P %FGA: {s.get('pct_fga_3p')} | FG%: {s.get('fg_pct_3p')}")
        
        vol = s.get('fga')
        perFGA = vol * (s.get('pct_fga_16_3p') + s.get('pct_fga_3p'))
        perFGM = vol * ((s.get('pct_fga_16_3p') * s.get('fg_pct_16_3p')) + (s.get('pct_fga_3p') * s.get('fg_pct_3p')))
        perEff = perFGM / perFGA if perFGA > 0 else 0
        
        print(f"perFGA: {perFGA} | perFGM: {perFGM} | perEff: {perEff}")
