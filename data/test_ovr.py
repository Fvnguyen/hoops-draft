import numpy as np

def ovr(profile, ratings, cfg):
    w = np.array(cfg["weights"][profile], float)
    r = np.array(ratings, float)
    t1, t2 = cfg["TOP1"], cfg["TOP2"]

    w_eff = w * (1 - (t1 + t2) / 100)
    top = np.argsort(-r, kind="stable")
    w_eff[top[0]] += t1
    w_eff[top[1]] += t2

    raw = w_eff @ r / 100
    low = w <= cfg["OFFROLE_MAX_W"]
    raw += cfg["FORGIVE"] * np.sum(np.where(low, w, 0) / 100 * np.clip(cfg["REF"] - r, 0, None))

    return int(round(min(100, max(0, raw))))

cfg = {
    "TOP1": 10,
    "TOP2": 5,
    "FORGIVE": 0.5,
    "OFFROLE_MAX_W": 7,
    "REF": 60,
    "weights": {
        "PG": [15, 10, 20, 30, 6, 14, 5],
        "SG": [15, 18, 28, 14, 5, 15, 5],
        "SF": [20, 14, 18, 10, 14, 17, 7],
        "PF": [24, 13, 9, 5, 20, 11, 18],
        "C": [24, 8, 4, 5, 29, 7, 23],
        "G": [15, 14, 24, 22, 5, 15, 5],
        "F": [22, 13, 13, 7, 17, 14, 14],
        "G/F": [18, 14, 21, 14, 10, 16, 7],
        "F/C": [24, 11, 6, 5, 24, 9, 21],
        "Gold": [14, 14, 14, 14, 14, 15, 15],
    }
}

print("Running tests...")
passed = True
for prof, w in cfg["weights"].items():
    if sum(w) != 100:
        print(f"FAIL: {prof} weights sum to {sum(w)}")
        passed = False
    
    r60 = [60]*7
    o60 = ovr(prof, r60, cfg)
    if o60 != 60:
        print(f"FAIL: {prof} 60->{o60}")
        passed = False
        
    r99 = [99]*7
    o99 = ovr(prof, r99, cfg)
    if o99 != 99:
        print(f"FAIL: {prof} 99->{o99}")
        passed = False

if passed:
    print("All tests passed!")
