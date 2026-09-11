import json
import numpy as np
import os

with open('computed_cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# Focus on Playmaking (Assists) to test the scaling models
# We will use Total Counting Stats (not per-36) as requested
asts = [c['stats'].get('ast', 0) for c in cards]

# Calculate Benchmarks
b_max = np.max(asts)
b_top5_avg = np.mean(sorted(asts, reverse=True)[:max(1, int(len(asts)*0.05))])
b_p90 = np.percentile(asts, 90)
b_p80 = np.percentile(asts, 80)
b_p75 = np.percentile(asts, 75)

benchmarks = {
    "Absolute Max": b_max,
    "Top 5% Avg": b_top5_avg,
    "90th Percentile": b_p90,
    "80th Percentile": b_p80,
    "75th Percentile": b_p75
}

# Test Subjects representing different archetypes
subjects = ["Tyrese Haliburton", "Nikola Jokic", "De'Aaron Fox", "Marcus Smart", "Bam Adebayo", "Matisse Thybulle"]
test_cards = [c for c in cards if c['player']['name'] in subjects]

artifact_path = r'C:\Users\fabia\.gemini\antigravity\brain\f4f60ea6-80a6-42bc-9f5a-01f60bf3e531\benchmark_analysis.md'

with open(artifact_path, 'w', encoding='utf-8') as out:
    out.write("# Benchmark & Scaling Analysis (Total Volume Stats)\n\n")
    out.write("By using raw counting stats (like total APG), we naturally penalize bench players who don't play enough minutes to accrue volume, perfectly aligning with your design choice.\n\n")
    
    out.write("## 1. Benchmark Cutoff Values for Assists (APG)\n")
    out.write("Here are the mathematically derived benchmarks for our 448 players:\n")
    for name, val in benchmarks.items():
        out.write(f"- **{name}:** {val:.1f} APG\n")
    out.write("\n")
    
    out.write("## 2. Comparing Cutoffs & Scaling (40-Floor vs Raw Index)\n\n")
    
    # Generate tables for each benchmark
    for b_name, b_val in benchmarks.items():
        out.write(f"### Benchmark: {b_name} ({b_val:.1f} APG)\n")
        out.write("| Player | APG | Index % | `40 + (Index * 60)` | Raw Index (`Index * 100`) |\n")
        out.write("|:---|---:|---:|---:|---:|\n")
        
        # Sort subjects by AST descending
        sorted_cards = sorted(test_cards, key=lambda x: x['stats'].get('ast', 0), reverse=True)
        
        for c in sorted_cards:
            ast = c['stats'].get('ast', 0)
            
            # Calculate Index (Capped at 1.0)
            index = min(1.0, ast / b_val) if b_val > 0 else 0
            
            # Calculate Scaled (40-Floor)
            scaled = 40 + (index * 60)
            
            # Calculate Raw (0-Floor)
            raw = index * 100
            
            out.write(f"| {c['player']['name']} | {ast} | {index*100:.1f}% | **{scaled:.0f}** | **{raw:.0f}** |\n")
        out.write("\n")
        
    out.write("## 3. Analysis & Recommendation\n")
    out.write("*(See the chat for full breakdown of these results)*\n")

