import json
from collections import defaultdict
import numpy as np

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# The 5 players requested
target_players = ["De'Aaron Fox", "Bam Adebayo", "Jarrett Allen", "Immanuel Quickley", "Matisse Thybulle"]
found_targets = [c for c in cards if c['player']['name'] in target_players]

def get_adv_score(stats):
    adv = 1.0
    if stats.get('per'): adv += (stats['per'] - 15) * 0.005
    if stats.get('vorp'): adv += stats['vorp'] * 0.01
    if stats.get('bpm'): adv += stats['bpm'] * 0.005
    return adv

with open('C:\\Users\\fabia\\.gemini\\antigravity\\brain\\f4f60ea6-80a6-42bc-9f5a-01f60bf3e531\\pivot_report.md', 'w', encoding='utf-8') as out:
    out.write("# Player Deep Dives & Rarity Pivot\n\n")
    
    out.write("## 1. Selected Player Profiles\n\n")
    for c in found_targets:
        name = c['player']['name']
        pos = c['player']['position']
        rarity = c['rarity']
        ovr = c['ratings']['overall']
        
        out.write(f"### {name} ({pos} | {rarity} {ovr})\n")
        
        # Base Stats
        s = c['stats']
        out.write("**Base Stats:**\n")
        out.write(f"- PPG: {s['pts']} | APG: {s['ast']} | RPG: {s['trb']} | SPG: {s['stl']} | BPG: {s['blk']} | TS%: {s['ts']*100:.1f}%\n")
        
        # Dimensions
        r = c['ratings']
        out.write("**Dimensions:**\n")
        out.write(f"- FIN: {r['finishing']} | MID: {r['midRange']} | PER: {r['perimeter']} | PLY: {r['playmaking']} | REB: {r['rebounding']} | P-DEF: {r['perimeterDefense']} | I-DEF: {r['postDefense']}\n")
        
        # Badges
        if not c['traits']:
            out.write("**Badges:** None\n\n")
        else:
            badges_str = ", ".join([f"{t['name']} (Lvl {t['level']})" for t in c['traits']])
            out.write(f"**Badges:** {badges_str}\n\n")
            
    out.write("---\n\n")
    out.write("## 2. Pivot by Rarity\n\n")
    
    rarities = ['Mythic', 'Rare', 'Uncommon', 'Common']
    
    # Store aggregated data
    agg = {r: defaultdict(list) for r in rarities}
    badge_totals = {r: defaultdict(int) for r in rarities}
    counts = {r: 0 for r in rarities}
    
    for c in cards:
        r = c['rarity']
        counts[r] += 1
        
        # OVR
        agg[r]['ovr'].append(c['ratings']['overall'])
        
        # Dimensions
        for dim in ['finishing', 'midRange', 'perimeter', 'playmaking', 'rebounding', 'perimeterDefense', 'postDefense']:
            agg[r][dim].append(c['ratings'][dim])
            
        # Base Stats
        for stat in ['pts', 'ast', 'trb', 'stl', 'blk', 'ts']:
            agg[r][stat].append(c['stats'].get(stat, 0))
            
        # Advanced Score
        agg[r]['adv_score'].append(get_adv_score(c['stats']))
        
        # Badges
        for t in c['traits']:
            badge_totals[r][t['name']] += t['level']
            
    for rarity in rarities:
        n = counts[rarity]
        out.write(f"### {rarity} (n={n})\n")
        
        if n == 0:
            out.write("No players found in this rarity.\n\n")
            continue
            
        ovr_avg = np.mean(agg[rarity]['ovr'])
        out.write(f"- **Avg OVR:** {ovr_avg:.1f}\n")
        
        out.write("- **Avg Dimensions:** ")
        dims = [f"{dim.upper()[:3]}: {np.mean(agg[rarity][dim]):.1f}" for dim in ['finishing', 'midRange', 'perimeter', 'playmaking', 'rebounding', 'perimeterDefense', 'postDefense']]
        out.write(", ".join(dims) + "\n")
        
        out.write("- **Avg Base Stats:** ")
        stats_str = f"PPG: {np.mean(agg[rarity]['pts']):.1f}, APG: {np.mean(agg[rarity]['ast']):.1f}, RPG: {np.mean(agg[rarity]['trb']):.1f}, SPG: {np.mean(agg[rarity]['stl']):.1f}, BPG: {np.mean(agg[rarity]['blk']):.1f}, TS%: {np.mean(agg[rarity]['ts'])*100:.1f}%"
        out.write(stats_str + "\n")
        
        out.write(f"- **Avg Advanced Multiplier:** {np.mean(agg[rarity]['adv_score']):.3f}\n")
        
        out.write("- **Avg Badge Level (Per Player):**\n")
        # Sort badges alphabetically or by highest average
        sorted_badges = sorted(badge_totals[rarity].keys())
        for b in sorted_badges:
            avg_lvl = badge_totals[rarity][b] / n
            out.write(f"  - {b}: {avg_lvl:.2f}\n")
        out.write("\n")
