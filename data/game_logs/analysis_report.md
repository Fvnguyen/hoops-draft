```

══════════════════════════════════════════════════════════════════════
  NBA CARD GAME — COMPREHENSIVE ANALYSIS
══════════════════════════════════════════════════════════════════════
  Source: full_dump_2026-09-12T08-34-47-842Z.json
  Draft Sessions: 2 | Seasons: 2 | Games: 14
  Generated: 2026-09-12T08:40:40.123Z

──────────────────────────────────────────────────────────────────────
  1. DRAFT INTEGRITY
──────────────────────────────────────────────────────────────────────

  Session #1: session_1789169058857
    Total cards: 288 (264 players, 24 plays)
    Cube uniqueness: 113/264 unique !! 151 DUPLICATES
      Russell Westbrook: appears 2x
      Paul George: appears 2x
      Bismack Biyombo: appears 2x
      Andre Drummond: appears 2x
      Giannis Antetokounmpo: appears 2x

    Rarity distribution (264 player cards across 24 packs):
      Mythic    :   4 total |  0.17/pack |  0.5/seat | ░░░░░░░░░░░░░░░░░░░░
      Rare      :  20 total |  0.83/pack |  2.5/seat | ██░░░░░░░░░░░░░░░░░░
      Uncommon  :  72 total |  3.00/pack |  9.0/seat | █████░░░░░░░░░░░░░░░
      Common    : 168 total |  7.00/pack | 21.0/seat | █████████████░░░░░░░

    Play card rarity (24 plays):
      Mythic    :   5
      Rare      :   7
      Uncommon  :   6
      Common    :   6

    Position coverage per seat:
      You             : PG:6  SG:3  SF:1  PF:1  C:1 ✓
      Astro           : PG:4  SG:4  SF:1  PF:1  C:2 ✓
      HoopsBot        : PG:2  SG:1  SF:3  PF:2  C:4 ✓
      DataDunk        : PG:5  SG:4  SF:1  PF:1  C:1 ✓
      SwishAI         : PG:2  SG:2  SF:3  PF:2  C:3 ✓
      DraftGPT        : PG:4  SG:3  SF:2  PF:1  C:2 ✓
      NetMaster       : PG:3  SG:2  SF:3  PF:2  C:2 ✓
      RimRunner       : PG:4  SG:3  SF:2  PF:1  C:2 ✓

  Session #2: session_1789195603933
    Total cards: 288 (264 players, 24 plays)
    Cube uniqueness: 264/264 unique ✓

    Rarity distribution (264 player cards across 24 packs):
      Mythic    :  20 total |  0.83/pack |  2.5/seat | ██░░░░░░░░░░░░░░░░░░
      Rare      :  21 total |  0.88/pack |  2.6/seat | ██░░░░░░░░░░░░░░░░░░
      Uncommon  :  53 total |  2.21/pack |  6.6/seat | ████░░░░░░░░░░░░░░░░
      Common    : 170 total |  7.08/pack | 21.3/seat | █████████████░░░░░░░

    Play card rarity (24 plays):
      Mythic    :   6
      Rare      :   6
      Uncommon  :   7
      Common    :   5

    Position coverage per seat:
      You             : PG:3  SG:2  SF:2  PF:2  C:3 ✓
      Astro           : PG:3  SG:2  SF:2  PF:2  C:3 ✓
      HoopsBot        : PG:3  SG:3  SF:2  PF:2  C:2 ✓
      DataDunk        : PG:3  SG:3  SF:2  PF:2  C:2 ✓
      SwishAI         : PG:3  SG:2  SF:2  PF:2  C:3 ✓
      DraftGPT        : PG:2  SG:2  SF:3  PF:2  C:3 ✓
      NetMaster       : PG:4  SG:3  SF:2  PF:2  C:1 ✓
      RimRunner       : PG:1  SG:1  SF:3  PF:3  C:4 ✓

──────────────────────────────────────────────────────────────────────
  2. DRAFT STRATEGY
──────────────────────────────────────────────────────────────────────

  Session #1:
    Value Curve (Avg OVR by pick # within pack):
      Pick # 1:  79.1 █████████████████████████
      Pick # 2:  72.7 ███████████████████████░░
      Pick # 3:  65.0 █████████████████████░░░░
      Pick # 4:  67.2 █████████████████████░░░░
      Pick # 5:  67.8 █████████████████████░░░░
      Pick # 6:  56.1 ██████████████████░░░░░░░
      Pick # 7:  51.9 ████████████████░░░░░░░░░
      Pick # 8:  48.3 ███████████████░░░░░░░░░░
      Pick # 9:  45.5 ██████████████░░░░░░░░░░░
      Pick #10:  41.3 █████████████░░░░░░░░░░░░
      Pick #11:  40.2 █████████████░░░░░░░░░░░░
      Pick #12:  40.0 █████████████░░░░░░░░░░░░
      Early(1-4): 70.6 → Late(9-12): 41.7 | Gap: 28.9

    Team Strength by Seat (avg OVR of all drafted players):
      #1 Astro           : avg  59.2 | top5  82.6 | 35 cards ████████████████████
      #2 HoopsBot        : avg  56.9 | top5  88.2 | 35 cards ███████████████████░
      #3 You             : avg  56.2 | top5  84.2 | 33 cards ███████████████████░
      #4 DraftGPT        : avg  55.4 | top5  84.8 | 29 cards ███████████████████░
      #5 DataDunk        : avg  54.9 | top5  77.2 | 34 cards ███████████████████░
      #6 SwishAI         : avg  54.9 | top5  80.4 | 34 cards ███████████████████░
      #7 NetMaster       : avg  52.2 | top5  73.8 | 32 cards ██████████████████░░
      #8 RimRunner       : avg  50.9 | top5  76.2 | 32 cards █████████████████░░░

    Round 1, Pick 1 (who picked what):
      human-0   : Jaylen Brown           Rare 81 OVR
      bot-1     : Donovan Clingan        Rare 88 OVR
      bot-2     : Giannis Antetokounmpo  Mythic 89 OVR
      bot-3     : Deni Avdija            Uncommon 79 OVR
      bot-4     : Jimmy Butler           Rare 72 OVR
      bot-5     : Mark Williams          Uncommon 79 OVR
      bot-6     : 7 Seconds or Less      Mythic 
      bot-7     : Grit and Grind         Rare 

  Session #2:
    Value Curve (Avg OVR by pick # within pack):
      Pick # 1:  83.5 █████████████████████████
      Pick # 2:  73.0 ██████████████████████░░░
      Pick # 3:  68.7 █████████████████████░░░░
      Pick # 4:  65.9 ████████████████████░░░░░
      Pick # 5:  64.8 ███████████████████░░░░░░
      Pick # 6:  62.6 ███████████████████░░░░░░
      Pick # 7:  54.4 ████████████████░░░░░░░░░
      Pick # 8:  51.1 ███████████████░░░░░░░░░░
      Pick # 9:  51.0 ███████████████░░░░░░░░░░
      Pick #10:  48.8 ███████████████░░░░░░░░░░
      Pick #11:  45.2 ██████████████░░░░░░░░░░░
      Pick #12:  44.7 █████████████░░░░░░░░░░░░
      Early(1-4): 72.3 → Late(9-12): 47.4 | Gap: 24.9

    Team Strength by Seat (avg OVR of all drafted players):
      #1 You             : avg  66.2 | top5  92.0 | 33 cards ████████████████████
      #2 NetMaster       : avg  61.1 | top5  86.0 | 30 cards ██████████████████░░
      #3 Astro           : avg  60.9 | top5  92.8 | 34 cards ██████████████████░░
      #4 DataDunk        : avg  57.5 | top5  87.2 | 33 cards █████████████████░░░
      #5 SwishAI         : avg  57.0 | top5  85.6 | 35 cards █████████████████░░░
      #6 HoopsBot        : avg  56.3 | top5  84.8 | 32 cards █████████████████░░░
      #7 DraftGPT        : avg  55.8 | top5  81.6 | 33 cards █████████████████░░░
      #8 RimRunner       : avg  55.1 | top5  77.0 | 34 cards █████████████████░░░

    Round 1, Pick 1 (who picked what):
      human-0   : Donovan Mitchell       Mythic 92 OVR
      bot-1     : Jarrett Allen          Rare 82 OVR
      bot-2     : Triangle Offense       Mythic 
      bot-3     : Victor Wembanyama      Mythic 99 OVR
      bot-4     : Giannis Antetokounmpo  Mythic 89 OVR
      bot-5     : Shai Gilgeous-Alexander Mythic 99 OVR
      bot-6     : Jamal Murray           Rare 87 OVR
      bot-7     : Kawhi Leonard          Mythic 85 OVR

──────────────────────────────────────────────────────────────────────
  3. ROSTER COMPARISON
──────────────────────────────────────────────────────────────────────

  Session #1:
    You             : Starters  84.2 OVR | Roster  76.7 OVR | Badges: Floor General×8, Sharpshooter×7, Mid-Range Maestro×5 | Plays: Box-and-One, Box-and-One, Grit and Grind
    Astro           : Starters  80.2 OVR | Roster  77.7 OVR | Badges: Mid-Range Maestro×10, Sharpshooter×7, Floor General×6 | Plays: Motion Offense
    HoopsBot        : Starters  85.8 OVR | Roster  79.7 OVR | Badges: Glass Cleaner×8, Lockdown Defender×8, Finisher×6 | Plays: Box-and-One
    DataDunk        : Starters  68.8 OVR | Roster  69.5 OVR | Badges: Floor General×10, Finisher×7, Mid-Range Maestro×6 | Plays: 7 Seconds or Less, High Pick & Roll
    SwishAI         : Starters  79.6 OVR | Roster  75.5 OVR | Badges: Finisher×8, Glass Cleaner×8, Sharpshooter×4 | Plays: Grit and Grind, Full Court Press
    DraftGPT        : Starters  82.2 OVR | Roster  74.8 OVR | Badges: Sharpshooter×7, Mid-Range Maestro×5, Floor General×4 | Plays: 7 Seconds or Less, Grit and Grind, Motion Offense
    NetMaster       : Starters  73.8 OVR | Roster  67.7 OVR | Badges: Finisher×9, Sharpshooter×5, Floor General×2 | Plays: 7 Seconds or Less, 7 Seconds or Less, Motion Offense
    RimRunner       : Starters  73.6 OVR | Roster  68.3 OVR | Badges: Sharpshooter×6, Floor General×5, Finisher×4 | Plays: Triangle Offense, Grit and Grind, High Pick & Roll

  Session #2:
    You             : Starters  89.8 OVR | Roster  81.3 OVR | Badges: Finisher×8, Floor General×6, Glass Cleaner×6 | Plays: High Pick & Roll, Grit and Grind, Full Court Press
    Astro           : Starters  90.6 OVR | Roster  81.7 OVR | Badges: Finisher×9, Sharpshooter×8, Floor General×6 | Plays: High Pick & Roll, Full Court Press
    HoopsBot        : Starters  79.8 OVR | Roster  72.8 OVR | Badges: Sharpshooter×11, Mid-Range Maestro×7, Paint Protector×3 | Plays: Triangle Offense, 7 Seconds or Less, Triangle Offense
    DataDunk        : Starters  86.6 OVR | Roster  75.8 OVR | Badges: Sharpshooter×11, Finisher×7, Floor General×6 | Plays: High Pick & Roll, Box-and-One, Full Court Press
    SwishAI         : Starters  81.8 OVR | Roster  77.4 OVR | Badges: Sharpshooter×15, Finisher×8, Mid-Range Maestro×6 | Plays: Box-and-One
    DraftGPT        : Starters  81.2 OVR | Roster  72.7 OVR | Badges: Finisher×11, Sharpshooter×6, Mid-Range Maestro×4 | Plays: 7 Seconds or Less, Grit and Grind, Horns
    NetMaster       : Starters  80.2 OVR | Roster  75.9 OVR | Badges: Sharpshooter×10, Floor General×7, Mid-Range Maestro×5 | Plays: Grit and Grind, Grit and Grind, Motion Offense
    RimRunner       : Starters  74.2 OVR | Roster  71.3 OVR | Badges: Sharpshooter×12, Mid-Range Maestro×8, Glass Cleaner×6 | Plays: 7 Seconds or Less, Triangle Offense

──────────────────────────────────────────────────────────────────────
  4. SCORING REALISM
──────────────────────────────────────────────────────────────────────

  Team Scores (28 team-games):
    Min: 52 | Max: 91 | Avg: 72.3 | Median: 73.0 | σ: ±9.3

  Game Totals (14 games):
    Avg: 144.6 | Range: 124–175

  Score Distribution:
    < 80    :  22 ( 78.6%) ████████████████████░░░░░
    80-89   :   5 ( 17.9%) ████░░░░░░░░░░░░░░░░░░░░░
    90-99   :   1 (  3.6%) █░░░░░░░░░░░░░░░░░░░░░░░░
    100-109 :   0 (  0.0%) ░░░░░░░░░░░░░░░░░░░░░░░░░
    110-119 :   0 (  0.0%) ░░░░░░░░░░░░░░░░░░░░░░░░░
    120-130 :   0 (  0.0%) ░░░░░░░░░░░░░░░░░░░░░░░░░
    > 130   :   0 (  0.0%) ░░░░░░░░░░░░░░░░░░░░░░░░░
    Verdict: !! Needs calibration

  Quarter Scoring (avg per team):
    Q1: 18.9 pts ███████████░░░░░░░░░
    Q2: 17.6 pts ██████████░░░░░░░░░░
    Q3: 18.1 pts ██████████░░░░░░░░░░
    Q4: 17.8 pts ██████████░░░░░░░░░░

──────────────────────────────────────────────────────────────────────
  5. COMPETITIVENESS
──────────────────────────────────────────────────────────────────────

  Margin of Victory: Avg 8.8 | Median 5.5 | Max 21
  Distribution:
    Buzzer (1-3)      :  5 ( 35.7%) ███████░░░░░░░░░░░░░
    Close (4-7)       :  4 ( 28.6%) ██████░░░░░░░░░░░░░░
    Moderate (8-14)   :  1 (  7.1%) █░░░░░░░░░░░░░░░░░░░
    Blowout (15-24)   :  4 ( 28.6%) ██████░░░░░░░░░░░░░░
    Blowout (25+)     :  0 (  0.0%) ░░░░░░░░░░░░░░░░░░░░

  Human vs Bots:
    vs HoopsBot          : 2-0  Pts 143-136 (avg margin +3.5)
    vs RimRunner         : 2-0  Pts 146-139 (avg margin +3.5)
    vs SwishAI           : 1-1  Pts 143-157 (avg margin -7.0)
    vs Astro             : 2-0  Pts 159-143 (avg margin +8.0)
    vs DataDunk          : 1-1  Pts 141-122 (avg margin +9.5)
    vs DraftGPT          : 2-0  Pts 163-145 (avg margin +9.0)
    vs NetMaster         : 1-1  Pts 135-153 (avg margin -9.0)
    Overall: 11-3 (78.6%)

──────────────────────────────────────────────────────────────────────
  6. POSSESSION ENGINE
──────────────────────────────────────────────────────────────────────

  Total Possessions: 1554 across 14 games
  Per Game: Avg 111 | Range 100–120

  Outcome Breakdown:
    2-Pointers  :  662 ( 42.6%) → 1324 pts (65.4% of scoring) █████████░░░░░░░░░░░
    3-Pointers  :  213 ( 13.7%) → 639 pts (31.6% of scoring) ███░░░░░░░░░░░░░░░░░
    And-1s      :   62 (  4.0%) → 62 pts (3.1% of scoring) █░░░░░░░░░░░░░░░░░░░
    Misses      :  569 ( 36.6%)  ███████░░░░░░░░░░░░░
    Turnovers   :   48 (  3.1%)  █░░░░░░░░░░░░░░░░░░░

  Efficiency:
    PPP: 1.303
    eFG%: 69.3%
    Scoring Rate: 60.3% of possessions score
    TO Rate: 3.1%

──────────────────────────────────────────────────────────────────────
  7. BOX SCORE DEEP DIVE
──────────────────────────────────────────────────────────────────────

  Top 10 Scorers (avg PPG):
     1. Jrue Holiday          :  24.0 PPG | 11.0 MPG | 1.04 pts/poss | 1 games
     2. Andrew Wiggins        :  17.0 PPG | 16.8 MPG | 0.49 pts/poss | 1 games
     3. Kel'el Ware           :  14.4 PPG | 25.6 MPG | 0.27 pts/poss | 8 games
     4. Jaylen Brown          :  14.3 PPG | 24.0 MPG | 0.28 pts/poss | 8 games
     5. Kevin Durant          :  13.0 PPG | 15.4 MPG | 0.41 pts/poss | 1 games
     6. Giannis Antetokounmpo :  13.0 PPG | 26.2 MPG | 0.24 pts/poss | 8 games
     7. Nikola Jokić          :  13.0 PPG | 16.3 MPG | 0.38 pts/poss | 1 games
     8. Chet Holmgren         :  12.4 PPG | 16.6 MPG | 0.36 pts/poss | 8 games
     9. Ivica Zubac           :  12.0 PPG | 28.3 MPG | 0.20 pts/poss | 1 games
    10. Bam Adebayo           :  12.0 PPG | 16.2 MPG | 0.36 pts/poss | 3 games

  Minutes Distribution: Avg 11.5 MPG | Median 11.5 | Max 28.3
    Starters (25+ MPG): 3 | Bench (8-24 MPG): 82 | DNP (<8 MPG): 24

──────────────────────────────────────────────────────────────────────
  8. ROTATION AUDIT
──────────────────────────────────────────────────────────────────────

  Substitutions: 864 total across 14 games
  Per Game: Avg 61.7 | Range 32–80
  OT Games: 0/14

──────────────────────────────────────────────────────────────────────
  9. SYNERGY & PLAY BALANCE
──────────────────────────────────────────────────────────────────────

  Synergy Activation (28 team appearances):
    Midrange Money        :  26/28 ( 92.9%) ███████████████████░ ← TOO EASY
    Inside-Out            :  26/28 ( 92.9%) ███████████████████░ ← TOO EASY
    Young Guns            :  26/28 ( 92.9%) ███████████████████░ ← TOO EASY
    Paint Dominance       :  24/28 ( 85.7%) █████████████████░░░ ← TOO EASY
    Boards Brigade        :  24/28 ( 85.7%) █████████████████░░░ ← TOO EASY
    Court Vision          :  24/28 ( 85.7%) █████████████████░░░ ← TOO EASY
    Point God System      :  24/28 ( 85.7%) █████████████████░░░ ← TOO EASY
    Shooting Gallery      :  17/28 ( 60.7%) ████████████░░░░░░░░ ← COMMON
    Rim Protection        :  14/28 ( 50.0%) ██████████░░░░░░░░░░ ← COMMON
    Two-Way Wings         :  14/28 ( 50.0%) ██████████░░░░░░░░░░ ← COMMON
    Veteran Core          :  13/28 ( 46.4%) █████████░░░░░░░░░░░
    Lockdown Squad        :   6/28 ( 21.4%) ████░░░░░░░░░░░░░░░░
    Two-Way Terror        :   2/28 (  7.1%) █░░░░░░░░░░░░░░░░░░░ ← RARE

    Never activated (1): Brotherhood

  Play Effect Activation:
    Box-and-One           : Full 14 ( 82.4%) | Partial  0 (  0.0%) | None  3 ( 17.6%) ← ALWAYS FIRES
    Grit and Grind        : Full  5 ( 25.0%) | Partial 15 ( 75.0%) | None  0 (  0.0%)
    Triangle Offense      : Full  4 (100.0%) | Partial  0 (  0.0%) | None  0 (  0.0%) ← ALWAYS FIRES
    High Pick & Roll      : Full 11 (100.0%) | Partial  0 (  0.0%) | None  0 (  0.0%) ← ALWAYS FIRES
    Full Court Press      : Full 10 (100.0%) | Partial  0 (  0.0%) | None  0 (  0.0%) ← ALWAYS FIRES
    Motion Offense        : Full  4 (100.0%) | Partial  0 (  0.0%) | None  0 (  0.0%) ← ALWAYS FIRES
    7 Seconds or Less     : Full  6 ( 85.7%) | Partial  1 ( 14.3%) | None  0 (  0.0%) ← ALWAYS FIRES
    Horns                 : Full  1 (100.0%) | Partial  0 (  0.0%) | None  0 (  0.0%) ← ALWAYS FIRES

──────────────────────────────────────────────────────────────────────
  10. OVR → WINNING CORRELATION
──────────────────────────────────────────────────────────────────────

  Home/Away: Home 7-7 (50.0%)
    Home Avg: 71.8 | Away Avg: 72.9 | Edge: -1.1 pts

  OVR Impact: Higher OVR wins 61.5% | Upsets 38.5%
  Pearson r (OVR diff → score margin): 0.238
    Weak correlation — results feel random relative to team strength

──────────────────────────────────────────────────────────────────────
  11. CROSS-SEASON COMPARISON
──────────────────────────────────────────────────────────────────────

  Season #1 (season_1789169178046):
    Human Record: 6-1 | PF: 500 | PA: 480 | Diff: +20
    Standings:
      1. You               : 6-1 (+20) ← YOU
      2. SwishAI           : 1-0 (+21) 
      3. Astro             : 0-1 (-1) 
      4. RimRunner         : 0-1 (-2) 
      5. HoopsBot          : 0-1 (-2) 
      6. NetMaster         : 0-1 (-3) 
      7. DraftGPT          : 0-1 (-12) 
      8. DataDunk          : 0-1 (-21) 

  Season #2 (season_1789195905606):
    Human Record: 5-2 | PF: 530 | PA: 515 | Diff: +15
    Standings:
      1. You               : 5-2 (+15) ← YOU
      2. NetMaster         : 1-0 (+21) 
      3. DataDunk          : 1-0 (+2) 
      4. HoopsBot          : 0-1 (-5) 
      5. RimRunner         : 0-1 (-5) 
      6. DraftGPT          : 0-1 (-6) 
      7. SwishAI           : 0-1 (-7) 
      8. Astro             : 0-1 (-15) 

══════════════════════════════════════════════════════════════════════
  BALANCE & DESIGN FLAGS
══════════════════════════════════════════════════════════════════════

  🔴 CRITICAL:
    • Session 1: 151 duplicate player cards in cube pool

  🟡 WARNINGS:
    • Large OVR gap between best/worst drafter: 8.3 — draft might be too swingy
    • Large OVR gap between best/worst drafter: 11.1 — draft might be too swingy
    • Only 4% of scores fall in NBA range [90-130]
    • PPP (1.303) above NBA average — offense may be too strong
    • TO rate (3.1%) below NBA avg — turnovers too rare
    • Synergy "Midrange Money" activates 93% of the time — trivially easy
    • Synergy "Inside-Out" activates 93% of the time — trivially easy
    • Synergy "Young Guns" activates 93% of the time — trivially easy
    • Synergy "Paint Dominance" activates 86% of the time — trivially easy
    • Synergy "Boards Brigade" activates 86% of the time — trivially easy
    • Synergy "Court Vision" activates 86% of the time — trivially easy
    • Synergy "Point God System" activates 86% of the time — trivially easy

  🔵 INFO:
    • Low Mythic density: 0.5 per seat — Mythics feel special
    • Steep value curve (gap 28.9) — clear strategic picks
    • Steep value curve (gap 24.9) — clear strategic picks
    • High close-game rate (64%) — lots of competitive games
    • Play "Box-and-One" fully activates 82%
    • Play "Triangle Offense" fully activates 100%
    • Play "High Pick & Roll" fully activates 100%
    • Play "Full Court Press" fully activates 100%
    • Play "Motion Offense" fully activates 100%
    • Play "7 Seconds or Less" fully activates 86%
    • Play "Horns" fully activates 100%

══════════════════════════════════════════════════════════════════════
  Analysis Complete.
══════════════════════════════════════════════════════════════════════
```
