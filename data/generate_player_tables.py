import json
import os

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

target_players = ["De'Aaron Fox", "Bam Adebayo", "Jarrett Allen", "Immanuel Quickley", "Matisse Thybulle"]
targets = [c for c in cards if c['player']['name'] in target_players]

weights = {
    'G': {'finishing': 0.15, 'midRange': 0.15, 'perimeter': 0.25, 'playmaking': 0.25, 'rebounding': 0.05, 'perimeterDefense': 0.15, 'postDefense': 0.0},
    'W': {'finishing': 0.15, 'midRange': 0.15, 'perimeter': 0.20, 'playmaking': 0.15, 'rebounding': 0.15, 'perimeterDefense': 0.20, 'postDefense': 0.0},
    'B': {'finishing': 0.25, 'midRange': 0.15, 'perimeter': 0.05, 'playmaking': 0.05, 'rebounding': 0.25, 'perimeterDefense': 0.25, 'postDefense': 0.0}
}
# wait, my manual python weights above didn't perfectly match what engine.ts did anyway, because in engine.ts:
# Guard: wFin = 0.15; wMid = 0.15; wPer = 0.25; wPlay = 0.25; wReb = 0.05; wDef = 0.15;
# Wing: wFin = 0.15; wMid = 0.15; wPer = 0.20; wPlay = 0.15; wReb = 0.15; wDef = 0.20;
# Bigs: wFin = 0.25; wMid = 0.15; wPer = 0.05; wPlay = 0.05; wReb = 0.25; wDef = 0.25;
# And Def was a combination of 60% P-DEF and 40% I-DEF!!

def get_pool_name(pos):
    if pos in ['PG', 'SG', 'G']: return 'Guards (G)'
    if pos in ['SF', 'G/F', 'F/G']: return 'Wings (W)'
    return 'Bigs (B)'
    
def get_pool_key(pos):
    if pos in ['PG', 'SG', 'G']: return 'G'
    if pos in ['SF', 'G/F', 'F/G']: return 'W'
    return 'B'

artifact_path = r'C:\Users\fabia\.gemini\antigravity\brain\f4f60ea6-80a6-42bc-9f5a-01f60bf3e531\player_full_stats.md'

with open(artifact_path, 'w', encoding='utf-8') as out:
    out.write("# Deep Dive: Player Full Stats & Computations\n\n")
    
    for c in targets:
        p = c['player']
        s = c['stats']
        r = c['ratings']
        pool_k = get_pool_key(p['position'])
        
        # Engine Weights
        if pool_k == 'G':
            w_fin, w_mid, w_per, w_play, w_reb, w_def = 0.15, 0.15, 0.25, 0.25, 0.05, 0.15
        elif pool_k == 'W':
            w_fin, w_mid, w_per, w_play, w_reb, w_def = 0.15, 0.15, 0.20, 0.15, 0.15, 0.20
        else:
            w_fin, w_mid, w_per, w_play, w_reb, w_def = 0.25, 0.15, 0.05, 0.05, 0.25, 0.25
            
        combined_def = (r['perimeterDefense'] * 0.6) + (r['postDefense'] * 0.4)
        
        base_ovr = r['_baseOvr']
        adv_multiplier = r['_multiplier']
        
        out.write(f"## {p['name']} ({p['position']})\n")
        out.write(f"**Rarity:** {c['rarity']} | **Final OVR:** {r['overall']} | **Pool:** {get_pool_name(p['position'])}\n\n")
        
        # 1. Base Stats Table
        out.write("### Base Stats\n")
        out.write("| GP | MPG | PPG | RPG | APG | SPG | BPG | TOV | FGA | TS% |\n")
        out.write("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n")
        out.write(f"| {s.get('gp',0)} | {s.get('mpg',0)} | {s.get('pts',0)} | {s.get('trb',0)} | {s.get('ast',0)} | {s.get('stl',0)} | {s.get('blk',0)} | {s.get('tov',0)} | {s.get('fga',0)} | {s.get('ts',0)*100:.1f}% |\n\n")
        
        # 2. Advanced Multiplier Inputs
        out.write("### Advanced Multiplier\n")
        out.write("| PER | VORP | DBPM | **Final Multiplier** |\n")
        out.write("|---:|---:|---:|---:|\n")
        out.write(f"| {s.get('per',0)} | {s.get('vorp',0)} | {s.get('dbpm',0)} | **{adv_multiplier:.4f}x** |\n")
        out.write("*(Note: Multiplier = 0.8 + (Avg Percentile of PER, VORP, DBPM * 0.4))*\n\n")
        
        # 3. Distance Shooting (Raw Data)
        out.write("### Raw Shooting Distance Data\n")
        out.write("| Distance | % of FGA | FG% |\n")
        out.write("|:---|---:|---:|\n")
        out.write(f"| **0-3 ft** | {s.get('pct_fga_0_3',0)*100:.1f}% | {s.get('fg_pct_0_3',0)*100:.1f}% |\n")
        out.write(f"| **3-10 ft** | {s.get('pct_fga_3_10',0)*100:.1f}% | {s.get('fg_pct_3_10',0)*100:.1f}% |\n")
        out.write(f"| **10-16 ft** | {s.get('pct_fga_10_16',0)*100:.1f}% | {s.get('fg_pct_10_16',0)*100:.1f}% |\n")
        out.write(f"| **16-3P ft** | {s.get('pct_fga_16_3p',0)*100:.1f}% | {s.get('fg_pct_16_3p',0)*100:.1f}% |\n")
        out.write(f"| **3P** | {s.get('pct_fga_3p',0)*100:.1f}% | {s.get('fg_pct_3p',0)*100:.1f}% |\n\n")
        
        # 4. Computed Dimensions & OVR Math
        out.write("### Positional Rating Weights & Dimensions\n")
        out.write("| Dimension | Rating | Positional Weight | Weighted Contribution |\n")
        out.write("|:---|---:|---:|---:|\n")
        
        out.write(f"| Finishing | **{r['finishing']}** | {w_fin*100:.0f}% | {r['finishing']*w_fin:.1f} |\n")
        out.write(f"| Mid-Range | **{r['midRange']}** | {w_mid*100:.0f}% | {r['midRange']*w_mid:.1f} |\n")
        out.write(f"| Perimeter | **{r['perimeter']}** | {w_per*100:.0f}% | {r['perimeter']*w_per:.1f} |\n")
        out.write(f"| Playmaking | **{r['playmaking']}** | {w_play*100:.0f}% | {r['playmaking']*w_play:.1f} |\n")
        out.write(f"| Rebounding | **{r['rebounding']}** | {w_reb*100:.0f}% | {r['rebounding']*w_reb:.1f} |\n")
        out.write(f"| Combined Def (60%P / 40%I) | **{combined_def:.1f}** | {w_def*100:.0f}% | {combined_def*w_def:.1f} |\n")
        
        out.write(f"| **Base Weighted Avg** | | | **{base_ovr:.2f}** |\n\n")
        out.write(f"> **OVR Calculation:** Base {base_ovr:.2f} × Multiplier {adv_multiplier:.4f} = **{base_ovr * adv_multiplier:.2f}** (Rounded to {r['overall']})\n\n")
        
        # 5. Badges
        out.write("### Badges / Traits\n")
        if not c['traits']:
            out.write("- None\n\n")
        else:
            for t in c['traits']:
                out.write(f"- **{t['name']}** (Level {t['level']})\n")
        out.write("\n---\n\n")
