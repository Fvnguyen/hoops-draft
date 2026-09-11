import json
import numpy as np
from collections import defaultdict

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

rarities = ['Mythic', 'Rare', 'Uncommon', 'Common']

# Store aggregated data
agg = {r: defaultdict(list) for r in rarities}
badge_totals = {r: defaultdict(int) for r in rarities}
counts = {r: 0 for r in rarities}

for c in cards:
    r = c['rarity']
    counts[r] += 1
    
    agg[r]['ovr'].append(c['ratings']['overall'])
    for dim in ['finishing', 'midRange', 'perimeter', 'playmaking', 'rebounding', 'perimeterDefense', 'postDefense']:
        agg[r][dim].append(c['ratings'][dim])
        
    for stat in ['pts', 'ast', 'trb', 'stl', 'blk', 'ts']:
        agg[r][stat].append(c['stats'].get(stat, 0))
        
    agg[r]['adv_score'].append(c['ratings'].get('_multiplier', 1.0))
    
    for t in c['traits']:
        badge_totals[r][t['name']] += t['level']

all_badges = set()
for r in rarities:
    for b in badge_totals[r].keys():
        all_badges.add(b)
all_badges = sorted(list(all_badges))

artifact_path = r'C:\Users\fabia\.gemini\antigravity\brain\f4f60ea6-80a6-42bc-9f5a-01f60bf3e531\rarity_pivot.md'

with open(artifact_path, 'w', encoding='utf-8') as out:
    out.write("# Rarity Pivot Tables\n\n")
    out.write("Here is the requested breakdown of all averages grouped by rarity, formatted as clean tables for easy comparison.\n\n")
    
    # 1. Macro & Base Stats
    out.write("### 1. Base Stats & Multiplier\n")
    out.write("| Rarity | Count | Avg OVR | Avg Multiplier | PPG | APG | RPG | SPG | BPG | TS% |\n")
    out.write("|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n")
    for r in rarities:
        n = counts[r]
        if n == 0: continue
        ts = np.mean(agg[r]['ts']) * 100
        out.write(f"| **{r}** | {n} | **{np.mean(agg[r]['ovr']):.1f}** | {np.mean(agg[r]['adv_score']):.3f}x | {np.mean(agg[r]['pts']):.1f} | {np.mean(agg[r]['ast']):.1f} | {np.mean(agg[r]['trb']):.1f} | {np.mean(agg[r]['stl']):.1f} | {np.mean(agg[r]['blk']):.1f} | {ts:.1f}% |\n")
    out.write("\n")
    
    # 2. Dimensions
    out.write("### 2. Dimension Ratings\n")
    out.write("| Rarity | FIN | MID | PER | PLY | REB | P-DEF | I-DEF |\n")
    out.write("|:---|---:|---:|---:|---:|---:|---:|---:|\n")
    for r in rarities:
        n = counts[r]
        if n == 0: continue
        out.write(f"| **{r}** | {np.mean(agg[r]['finishing']):.1f} | {np.mean(agg[r]['midRange']):.1f} | {np.mean(agg[r]['perimeter']):.1f} | {np.mean(agg[r]['playmaking']):.1f} | {np.mean(agg[r]['rebounding']):.1f} | {np.mean(agg[r]['perimeterDefense']):.1f} | {np.mean(agg[r]['postDefense']):.1f} |\n")
    out.write("\n")
    
    # 3. Badges Part 1
    out.write("### 3. Average Badge Level (Core)\n")
    core_badges = ['Finisher', 'Mid-Range Maestro', 'Sharpshooter', 'Floor General', 'Glass Cleaner', 'Lockdown Defender', 'Paint Protector']
    header = "| Rarity | " + " | ".join(core_badges) + " |\n"
    divider = "|:---|" + "|".join(["---:"] * len(core_badges)) + "|\n"
    out.write(header)
    out.write(divider)
    for r in rarities:
        n = counts[r]
        if n == 0: continue
        row = f"| **{r}** |"
        for b in core_badges:
            avg = badge_totals[r][b] / n
            row += f" {avg:.2f} |"
        out.write(row + "\n")
    out.write("\n")
    
    # 4. Badges Part 2
    out.write("### 4. Average Badge Level (Special Skills)\n")
    spec_badges = [b for b in all_badges if b not in core_badges]
    header2 = "| Rarity | " + " | ".join(spec_badges) + " |\n"
    divider2 = "|:---|" + "|".join(["---:"] * len(spec_badges)) + "|\n"
    out.write(header2)
    out.write(divider2)
    for r in rarities:
        n = counts[r]
        if n == 0: continue
        row = f"| **{r}** |"
        for b in spec_badges:
            avg = badge_totals[r][b] / n
            row += f" {avg:.2f} |"
        out.write(row + "\n")
    out.write("\n")
