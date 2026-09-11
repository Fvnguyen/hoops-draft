import json
from collections import Counter
import numpy as np

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

with open('analyze_v4_out.txt', 'w', encoding='utf-8') as out:
    # Rarity
    rarity_counts = Counter(c['rarity'] for c in cards)
    out.write("=== RARITY DISTRIBUTION ===\n")
    for r in ['Mythic', 'Rare', 'Uncommon', 'Common']:
        out.write(f"{r}: {rarity_counts[r]} ({rarity_counts[r]/len(cards)*100:.1f}%)\n")

    # OVR Buckets
    ovr = [c['ratings']['overall'] for c in cards]
    out.write("\n=== OVR DISTRIBUTION ===\n")
    out.write(f"90+: {sum(1 for o in ovr if o >= 90)}\n")
    out.write(f"80-89: {sum(1 for o in ovr if o >= 80 and o < 90)}\n")
    out.write(f"70-79: {sum(1 for o in ovr if o >= 70 and o < 80)}\n")
    out.write(f"60-69: {sum(1 for o in ovr if o >= 60 and o < 70)}\n")
    out.write(f"<60: {sum(1 for o in ovr if o < 60)}\n")

    # Top 10 OVR Players
    out.write("\n=== TOP 10 PLAYERS ===\n")
    sorted_cards = sorted(cards, key=lambda x: x['ratings']['overall'], reverse=True)
    for c in sorted_cards[:10]:
        out.write(f"{c['player']['name']} - {c['ratings']['overall']} ({c['player']['position']})\n")

    # Badge Distribution (Total Levels per player)
    badge_levels = [sum(t['level'] for t in c['traits']) for c in cards]
    out.write("\n=== BADGE LEVEL DISTRIBUTION ===\n")
    out.write(f"0 Badges: {sum(1 for b in badge_levels if b == 0)}\n")
    out.write(f"1-3 Levels: {sum(1 for b in badge_levels if 1 <= b <= 3)}\n")
    out.write(f"4-6 Levels: {sum(1 for b in badge_levels if 4 <= b <= 6)}\n")
    out.write(f"7+ Levels: {sum(1 for b in badge_levels if b >= 7)}\n")

    # Specialist Commons
    specialist_commons = [c for c in cards if c['rarity'] == 'Common' and sum(t['level'] for t in c['traits']) >= 2]
    out.write("\n=== SPECIALIST COMMONS (>= 2 Badge Levels) ===\n")
    out.write(f"Found {len(specialist_commons)}\n")
    for c in sorted(specialist_commons, key=lambda x: sum(t['level'] for t in x['traits']), reverse=True)[:5]:
        bl = sum(t['level'] for t in c['traits'])
        badges_str = ", ".join([f"{t['name']} (Lvl {t['level']})" for t in c['traits']])
        out.write(f"{c['player']['name']} (OVR {c['ratings']['overall']}) - {badges_str}\n")

    # Vanilla Mythics
    vanilla_mythics = [c for c in cards if c['rarity'] == 'Mythic' and not any(t['level'] == 3 for t in c['traits'])]
    out.write("\n=== VANILLA MYTHICS (0 Level 3 Badges) ===\n")
    out.write(f"Found {len(vanilla_mythics)}\n")
    for c in sorted(vanilla_mythics, key=lambda x: x['ratings']['overall'], reverse=True)[:10]:
        out.write(f"{c['player']['name']} (OVR {c['ratings']['overall']})\n")

    # Check Positional Pools Effect (Marcus Smart)
    out.write("\n=== MARCUS SMART CHECK ===\n")
    smart = [c for c in cards if 'Marcus Smart' in c['player']['name']]
    if smart:
        s = smart[0]
        out.write(f"OVR: {s['ratings']['overall']}, PLY: {s['ratings']['playmaking']}, DEF: {s['ratings']['perimeterDefense']}\n")
